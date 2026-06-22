import { z } from 'zod';
import { compareStepFiles } from '../compare.js';
import { withStepModel } from '../model-store.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import { queryStepEdges as queryEdgesService } from '../query/edges.js';
import { canDirectGetEntities, getStepEntitiesDirect } from '../query/entities.js';
import { queryStepFaces as queryFacesService } from '../query/faces.js';
import { queryStepPmi as queryPmiService } from '../query/pmi.js';
import { wrapTool } from './shared.js';

const stepFileInput = {
  file_path: z.string().min(1).describe('Absolute or relative path to the STEP file.'),
};

const inspectStepFileSchema = {
  ...stepFileInput,
};

const point3Schema = z.array(z.number().finite()).length(3);

const direction3Schema = point3Schema.refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, {
  message: 'Direction vector must be non-zero.',
});

const normalFilterSchema = z
  .object({
    parallel_to: direction3Schema.describe(
      'Direction vector [x, y, z] to match face normals against. Only faces whose normal is parallel to this direction match.'
    ),
    tolerance_degrees: z
      .number()
      .nonnegative()
      .max(180)
      .describe(
        'Angle tolerance in degrees (default: 10). Face normals within +/-tolerance of target direction match.'
      )
      .optional(),
  })
  .strict()
  .describe(
    'Filter by face normal direction. IMPORTANT: setting this restricts results to orientation-filtered faces. Only set when you need faces with a specific normal direction.'
  )
  .optional();

const edgeRadiusSchema = z
  .object({
    min: z
      .number()
      .nonnegative()
      .describe('Minimum radius in mm. Only affects circular/curved edges.')
      .optional(),
    max: z
      .number()
      .nonnegative()
      .describe('Maximum radius in mm. Only affects circular/curved edges.')
      .optional(),
  })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: 'radius.min must be <= radius.max.',
  })
  .describe(
    'Filter circular/curved edges by radius. IMPORTANT: setting this restricts results to edges that carry a radius (circular/curved only). Only set when querying circular edges by radius. Do NOT set as a placeholder.'
  )
  .optional();

function uniqueArray<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

function boundedRange(input: { min?: number; max?: number }): boolean {
  return input.min === undefined || input.max === undefined || input.min <= input.max;
}

const resultModeSchema = z
  .enum(['summary', 'entities', 'groups'])
  .describe(
    'Shape of the result object. "summary" = statistics and counts only, no entity list (fastest, fewest tokens). "entities" (default) = paginated entity list with projections. "groups" = aggregate the matched entities into groups (requires group_by; returns counts plus sample entity IDs per group). Use "summary" or "groups" first in a conversation, then drill into specific entities.'
  )
  .optional();

const returnTypeSchema = z
  .enum(['summary', 'entities', 'groups'])
  .describe(
    'Result shape: "summary" returns statistics only (fastest). "entities" (default) returns paginated entities with projections. "groups" returns group counts with sample IDs (requires group_by).'
  )
  .optional();

const limitSchema = z
  .number()
  .int()
  .positive()
  .max(1000)
  .describe(
    'Maximum number of entities to return per page. Default: 100. Max: 1000. Use with offset for pagination.'
  )
  .optional();
const offsetSchema = z
  .number()
  .int()
  .nonnegative()
  .describe(
    'Skip this many results before returning (for pagination). Default: 0. E.g., offset=100, limit=50 returns results 100-149.'
  )
  .optional();
const bodyIdSchema = z.string().regex(/^body:\d+$/, 'Body IDs must match body:N.');

const FACE_FIELDS = [
  'id',
  'surface_type',
  'area',
  'bbox',
  'bbox_center',
  'normal',
  'surface_parameters',
  'adjacent_faces',
  'closest_face_distance',
  'has_inner_wires',
  'body_id',
] as const;

const EDGE_FIELDS = [
  'id',
  'curve_type',
  'length',
  'bbox',
  'bbox_center',
  'radius',
  'start_point',
  'end_point',
  'adjacent_faces',
  'body_id',
] as const;

const FACE_GET_FIELDS = new Set<string>(FACE_FIELDS);
const EDGE_GET_FIELDS = new Set<string>(EDGE_FIELDS);

function mapBboxCenter(fields: string[] | undefined): string[] | undefined {
  return fields?.map((f) => (f === 'bbox_center' ? 'center' : f));
}

const faceIncludeSchema = z
  .array(
    z
      .enum(
        FACE_FIELDS.map((f) => (f === 'bbox_center' ? 'center' : f)) as unknown as [
          string,
          ...string[],
        ]
      )
      .describe(
        'Face projection fields: id=unique identifier, surface_type=geometry type, area=surface area mm^2, bbox=bounding box, center=centroid, normal=surface normal direction, surface_parameters=raw OCCT surface data (e.g. cylinder radius), adjacent_faces=list of adjacent faces with dihedral angle, closest_face_distance=minimum distance to any other face in the model, has_inner_wires=whether the face boundary contains interior wire(s) (holes/openings), body_id=which body this face belongs to (body:0, body:1, ...). Default: id,surface_type,area,bbox,center.'
      )
  )
  .min(1)
  .max(11)
  .refine(uniqueArray, 'Include values must be unique.')
  .describe(
    'List of face properties to include in results. Omit to get default projection (id, surface_type, area, bbox, center).'
  )
  .optional();

const faceFieldsSchema = z
  .array(z.enum(FACE_FIELDS as unknown as [string, ...string[]]))
  .min(1)
  .max(11)
  .refine(uniqueArray, 'Field values must be unique.')
  .describe('Face fields to include. Default: id,surface_type,area,bbox,bbox_center.')
  .optional();

const edgeIncludeSchema = z
  .array(
    z
      .enum(
        EDGE_FIELDS.map((f) => (f === 'bbox_center' ? 'center' : f)) as unknown as [
          string,
          ...string[],
        ]
      )
      .describe(
        'Edge projection fields: id=unique identifier, curve_type=line/circle/ellipse/bspline/other, length=edge length mm, bbox=bounding box, center=midpoint or arc center, radius=radius for circular curves (null for lines), start_point=endpoint [x,y,z], end_point=other endpoint [x,y,z], adjacent_faces=the faces that bound this edge with face_id and surface_type, body_id=which body this edge belongs to (body:0, body:1, ...). Default: id,curve_type,length,bbox,center.'
      )
  )
  .min(1)
  .max(10)
  .refine(uniqueArray, 'Include values must be unique.')
  .describe(
    'List of edge properties to include in results. Omit to get default projection (id, curve_type, length, bbox, center).'
  )
  .optional();

const edgeFieldsSchema = z
  .array(z.enum(EDGE_FIELDS as unknown as [string, ...string[]]))
  .min(1)
  .max(10)
  .refine(uniqueArray, 'Field values must be unique.')
  .describe('Edge fields to include. Default: id,curve_type,length,bbox,bbox_center.')
  .optional();

const faceGroupBySchema = z
  .array(
    z
      .enum(['surface_type', 'normal_direction', 'area_range', 'radius', 'body_id'])
      .describe(
        'Grouping dimension: surface_type=plane/cylinder/cone/etc; normal_direction=nearest principal axis (+X..-Z within 15 degrees, else off-axis); area_range=fixed log-scale size bucket in mm^2 (0-1, 1-10, 10-100, ...); radius=rounded to 0.5mm (cylindrical faces only); body_id=which body the face belongs to.'
      )
  )
  .min(1)
  .max(5)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe(
    'List of dimensions to group faces by; required when result_mode is "groups". E.g., ["surface_type"] groups by geometry type. Combining dimensions produces one group per distinct key combination. Bucket widths are fixed by the server.'
  )
  .optional();

const edgeGroupBySchema = z
  .array(
    z
      .enum(['curve_type', 'length_range', 'body_id'])
      .describe(
        'Grouping dimension: curve_type=line/circle/ellipse/bspline/other; length_range=fixed log-scale length bucket in mm (0-1, 1-10, 10-100, ...); body_id=which body the edge belongs to.'
      )
  )
  .min(1)
  .max(3)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe(
    'List of dimensions to group edges by; required when result_mode is "groups". E.g., ["curve_type","length_range"] groups by type and length bucket. Bucket widths are fixed by the server.'
  )
  .optional();
const faceSortSchema = z
  .object({
    by: z
      .enum(['area', 'surface_type', 'center_x', 'center_y', 'center_z'])
      .describe(
        'Sort field: area=surface area, surface_type=plane/cylinder/etc (alphabetic), center_x/y/z=face centroid coordinate'
      ),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .describe(
    'Sort results by one field and optional direction. E.g., {by:"area",direction:"desc"} sorts largest faces first.'
  )
  .optional();

const edgeSortSchema = z
  .object({
    by: z
      .enum(['length', 'curve_type', 'radius', 'center_x', 'center_y', 'center_z'])
      .describe(
        'Sort field: length=edge length, curve_type=line/circle/etc (alphabetic), radius=circular radius, center_x/y/z=edge center coordinate'
      ),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .describe(
    'Sort results by one field and optional direction. E.g., {by:"length",direction:"asc"} sorts shortest edges first (useful for finding tiny edges).'
  )
  .optional();

const faceFilterSchema = z
  .object({
    entity_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(200)
      .refine(uniqueArray)
      .describe(
        'List of face IDs to retrieve (e.g., ["face:0", "face:5"]). Limits results to exactly these faces. Max 200 IDs.'
      )
      .optional(),
    group_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .refine(uniqueArray)
      .describe(
        'Group IDs from a previous group_by result. Retrieves all entities within those groups. Requires the same group_by used to produce the groups. Use together to drill from grouped/counted populations into specific entities. Max 50 IDs.'
      )
      .optional(),
    surface_type: z
      .array(z.enum(['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'other']))
      .min(1)
      .max(7)
      .describe(
        'Surface geometry type(s). Returns only faces matching these types. "plane" = flat, "cylinder" = cylindrical, "cone" = conical, etc. Multiple types use AND logic (face must match one type).'
      )
      .refine(uniqueArray, 'Surface type values must be unique.')
      .optional(),
    area_min: z
      .number()
      .nonnegative()
      .describe(
        'Minimum face area in mm^2. Returns faces with area >= area_min. E.g., 100 returns faces >= 100 mm^2.'
      )
      .optional(),
    area_max: z
      .number()
      .nonnegative()
      .describe(
        'Maximum face area in mm^2. Returns faces with area <= area_max. E.g., 1000 returns faces <= 1000 mm^2.'
      )
      .optional(),
    normal_parallel_to: direction3Schema
      .describe(
        'Direction vector [x, y, z] to match face normals against. Returns faces whose surface normal is parallel to this direction. Normal tolerance determines how close "parallel" must be.'
      )
      .optional(),
    normal_tolerance_degrees: z
      .number()
      .nonnegative()
      .max(180)
      .describe(
        'Angle tolerance in degrees for normal_parallel_to matching. E.g., 10 degrees means normals within +/-10 degrees of the target direction pass.'
      )
      .optional(),
    body_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe(
        'Filter faces to specific body IDs (e.g., ["body:0", "body:1"]). Use after a summary/groups query to narrow to a subset of bodies in a multi-body model. Max 20 IDs.'
      )
      .optional(),
  })
  .strict()
  .refine(({ area_min, area_max }) => boundedRange({ min: area_min, max: area_max }), {
    message: 'area_min must be less than or equal to area_max.',
  });

const edgeFilterSchema = z
  .object({
    entity_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(200)
      .refine(uniqueArray)
      .describe(
        'List of edge IDs to retrieve (e.g., ["edge:0", "edge:42"]). Limits results to exactly these edges. Max 200 IDs.'
      )
      .optional(),
    group_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .refine(uniqueArray)
      .describe(
        'Group IDs from a previous group_by result. Retrieves all entities within those groups. Requires the same group_by used to produce the groups. Use together to drill from grouped/counted populations into specific entities. Max 50 IDs.'
      )
      .optional(),
    curve_type: z
      .array(z.enum(['line', 'circle', 'ellipse', 'bspline', 'other']))
      .min(1)
      .max(5)
      .describe(
        'Edge curve type(s). Returns only edges matching these types. "line" = straight, "circle" = circular, "ellipse" = elliptical, "bspline" = spline curve. Multiple types use AND logic.'
      )
      .refine(uniqueArray, 'Curve type values must be unique.')
      .optional(),
    length_min: z
      .number()
      .nonnegative()
      .describe(
        'Minimum edge length in mm. Returns edges with length >= length_min. E.g., 10 returns edges >= 10 mm.'
      )
      .optional(),
    length_max: z
      .number()
      .nonnegative()
      .describe(
        'Maximum edge length in mm. Returns edges with length <= length_max. E.g., 100 returns edges <= 100 mm.'
      )
      .optional(),
    radius_min: z
      .number()
      .nonnegative()
      .describe(
        'Minimum radius in mm for circular/curved edges. Returns edges with radius >= radius_min. Only applies to circular curves.'
      )
      .optional(),
    radius_max: z
      .number()
      .nonnegative()
      .describe(
        'Maximum radius in mm for circular/curved edges. Returns edges with radius <= radius_max. Only applies to circular curves.'
      )
      .optional(),
    body_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe(
        'Filter edges to specific body IDs (e.g., ["body:0", "body:1"]). Use after a summary/groups query to narrow to a subset of bodies in a multi-body model. Max 20 IDs.'
      )
      .optional(),
  })
  .strict()
  .refine(({ length_min, length_max }) => boundedRange({ min: length_min, max: length_max }), {
    message: 'length_min must be less than or equal to length_max.',
  })
  .refine(({ radius_min, radius_max }) => boundedRange({ min: radius_min, max: radius_max }), {
    message: 'radius_min must be less than or equal to radius_max.',
  });

/* ------------------------------------------------------------------ */
/*  PMI query schema                                                   */
/* ------------------------------------------------------------------ */

const pmiTypeSchema = z
  .enum(['geometric_tolerance', 'dimension', 'datum', 'annotation'])
  .describe('PMI entity type category');

const toleranceSubtypeSchema = z
  .enum([
    'position',
    'flatness',
    'straightness',
    'circularity',
    'cylindricity',
    'profile',
    'parallelism',
    'perpendicularity',
    'angularity',
    'concentricity',
    'runout',
    'symmetry',
    'coaxiality',
    'circular_runout',
    'total_runout',
    'surface_profile',
    'line_profile',
  ])
  .describe('Geometric tolerance subtype matching the STEP entity type name');

const pmiFilterSchema = z
  .object({
    pmi_types: z
      .array(pmiTypeSchema)
      .min(1)
      .max(5)
      .describe(
        'Filter by PMI entity type category: geometric_tolerance (GD&T callouts), dimension (linear/angular/diametral sizes and locations), datum (datum references and systems), annotation (notes, surface finish, callouts). Multiple types use OR logic.'
      )
      .optional(),
    tolerance_types: z
      .array(toleranceSubtypeSchema)
      .min(1)
      .max(17)
      .describe(
        'Filter geometric tolerances by subtype: position, flatness, straightness, circularity, cylindricity, profile, parallelism, perpendicularity, angularity, concentricity, runout, symmetry, coaxiality. Only applies when pmi_types includes geometric_tolerance.'
      )
      .optional(),
    value_min: z
      .number()
      .nonnegative()
      .describe('Minimum tolerance/dimension value in mm. Returns PMI with value >= value_min.')
      .optional(),
    value_max: z
      .number()
      .nonnegative()
      .describe('Maximum tolerance/dimension value in mm. Returns PMI with value <= value_max.')
      .optional(),
  })
  .strict()
  .refine(({ value_min, value_max }) => boundedRange({ min: value_min, max: value_max }), {
    message: 'value_min must be less than or equal to value_max.',
  });

const pmiGroupBySchema = z
  .array(
    z
      .enum(['type', 'tolerance_type', 'dimension_type', 'material_condition'])
      .describe(
        'Grouping dimension: type=geometric_tolerance/dimension/datum/annotation; tolerance_type=position/flatness/etc (geometric tolerances only); dimension_type=diameter/radius/length/location (dimensions only); material_condition=mmc/lmc/rfs (geometric tolerances only).'
      )
  )
  .min(1)
  .max(3)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe(
    'List of dimensions to group PMI entities by. E.g., ["type"] groups by category; ["type","tolerance_type"] groups tolerances by subtype within the tolerance group.'
  )
  .optional();

const pmiSortSchema = z
  .object({
    by: z
      .enum(['type', 'value', 'tolerance_type'])
      .describe(
        'Sort field: type=entity category (alphabetic), value= tolerance/dimension value, tolerance_type=geometric tolerance subtype'
      ),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .optional();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const internalFaceQuerySchema = {
  filter: faceFilterSchema.optional(),
  include: faceIncludeSchema,
  group_by: faceGroupBySchema,
  sort: faceSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const internalEdgeQuerySchema = {
  filter: edgeFilterSchema.optional(),
  include: edgeIncludeSchema,
  group_by: edgeGroupBySchema,
  sort: edgeSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const internalPmiQuerySchema = {
  filter: pmiFilterSchema.optional(),
  group_by: pmiGroupBySchema,
  sort: pmiSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

const findStepFacesSchema = {
  ...stepFileInput,
  surface_types: z
    .array(z.enum(['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'other']))
    .min(1)
    .max(7)
    .refine(uniqueArray, 'Surface type values must be unique.')
    .describe(
      'Surface geometry types to match. Multiple values use OR logic. Omit to include all types.'
    )
    .optional(),
  area_min: z
    .number()
    .nonnegative()
    .describe('Minimum face area in mm^2. Omit for no lower bound.')
    .optional(),
  area_max: z
    .number()
    .nonnegative()
    .describe('Maximum face area in mm^2. Omit for no upper bound.')
    .optional(),
  normal: normalFilterSchema,
  body_ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine(uniqueArray, 'Body IDs must be unique.')
    .describe('Restrict to specific bodies in multi-body models. Omit to search all bodies.')
    .optional(),
  fields: faceFieldsSchema,
  group_by: z
    .array(
      z
        .enum(['surface_type', 'area_range', 'radius', 'normal_direction', 'body_id'])
        .describe(
          'Grouping dimension: surface_type=plane/cylinder/etc; area_range=size bucket (0–1, 1–10, …); radius=rounded to 0.5mm (cylindrical faces only); normal_direction=nearest principal axis direction; body_id=which body the face belongs to.'
        )
    )
    .min(1)
    .max(5)
    .refine(uniqueArray, 'Group-by values must be unique.')
    .describe(
      'Group dimensions. Requires return_type:"groups". Ignored otherwise. Example: ["surface_type"] groups by geometry type.'
    )
    .optional(),
  sort: faceSortSchema,
  return_type: returnTypeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

const findStepEdgesSchema = {
  ...stepFileInput,
  curve_types: z
    .array(z.enum(['line', 'circle', 'ellipse', 'bspline', 'other']))
    .min(1)
    .max(5)
    .refine(uniqueArray, 'Curve type values must be unique.')
    .describe('Edge curve types to match. Multiple values use OR logic. Omit to include all types.')
    .optional(),
  length_min: z
    .number()
    .nonnegative()
    .describe('Minimum edge length in mm. Omit for no lower bound.')
    .optional(),
  length_max: z
    .number()
    .nonnegative()
    .describe('Maximum edge length in mm. For tiny edges, set this alone and omit radius filters.')
    .optional(),
  radius: edgeRadiusSchema,
  body_ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine(uniqueArray, 'Body IDs must be unique.')
    .describe('Restrict to specific bodies in multi-body models. Omit to search all bodies.')
    .optional(),
  fields: edgeFieldsSchema,
  group_by: edgeGroupBySchema,
  sort: edgeSortSchema,
  return_type: returnTypeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

const getStepEntitiesSchema = {
  ...stepFileInput,
  entity_type: z
    .enum(['face', 'edge'])
    .describe('Entity kind to retrieve. Determines valid ID prefix and field names.'),
  entity_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(200)
    .refine(uniqueArray, 'Entity IDs must be unique.')
    .describe(
      'Exact entity IDs. Must be face:N when entity_type is face, or edge:N when entity_type is edge.'
    ),
  fields: z
    .array(
      z.enum([
        ...FACE_FIELDS,
        ...EDGE_FIELDS.filter((f) => !FACE_FIELDS.includes(f as never)),
      ] as unknown as [string, ...string[]])
    )
    .min(1)
    .max(16)
    .refine(uniqueArray, 'Field values must be unique.')
    .describe('Entity fields to include. Face and edge fields are validated against entity_type.')
    .optional(),
};

const pmiQuerySchema = {
  ...stepFileInput,
  pmi_types: z
    .array(pmiTypeSchema)
    .min(1)
    .max(5)
    .refine(uniqueArray, 'PMI type values must be unique.')
    .describe(
      'PMI categories to filter by: geometric_tolerance, dimension, datum, annotation. Omit to include all categories.'
    )
    .optional(),
  tolerance_subtypes: z
    .array(toleranceSubtypeSchema)
    .min(1)
    .max(17)
    .refine(uniqueArray, 'Tolerance subtype values must be unique.')
    .describe(
      'Geometric tolerance subtypes to filter by (e.g., position, flatness). Only applies to geometric tolerance type.'
    )
    .optional(),
  value_min: z
    .number()
    .nonnegative()
    .describe('Minimum tolerance/dimension value in mm. Omit for no lower bound.')
    .optional(),
  value_max: z
    .number()
    .nonnegative()
    .describe('Maximum tolerance/dimension value in mm. Omit for no upper bound.')
    .optional(),
  group_by: pmiGroupBySchema,
  sort: pmiSortSchema,
  return_type: returnTypeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

export const stepToolSchemas = {
  inspectStepFile: inspectStepFileSchema,
  findStepFaces: findStepFacesSchema,
  findStepEdges: findStepEdgesSchema,
  getStepEntities: getStepEntitiesSchema,
  compareStepFiles: {
    baseline_file_path: z
      .string()
      .min(1)
      .describe('Absolute or relative path to the baseline/original STEP file.'),
    comparison_file_path: z
      .string()
      .min(1)
      .describe('Absolute or relative path to the comparison/changed STEP file.'),
  },
  queryStepPmi: pmiQuerySchema,
} as const;

const queryOutputSchema = z
  .object({
    schema_version: z.literal('0.4'),
    file_path: z.string(),
    units: z.object({}).passthrough(),
    coordinate_system: z.object({}).passthrough(),
    query: z.object({}).passthrough(),
    statistics: z.object({}).passthrough(),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
      returned: z.number(),
      total_matched: z.number(),
      has_more: z.boolean(),
    }),
    entities: z.array(z.object({}).passthrough()),
    groups: z.array(z.object({}).passthrough()),
    warnings: z.array(z.unknown()),
    limitations: z.array(z.unknown()),
  })
  .passthrough();

const compareOutputSchema = z
  .object({
    schema_version: z.literal('0.4'),
    files: z.object({ a: z.string(), b: z.string() }),
    deltas: z.object({}).passthrough(),
    exchange: z.object({}).passthrough(),
    warnings: z.array(z.object({}).passthrough()),
    limitations: z.array(z.object({}).passthrough()),
    providers: z.object({}).passthrough(),
  })
  .passthrough();

export const stepToolOutputSchemas = {
  inspectStepFile: {
    schema_version: z.literal('0.4'),
    file_path: z.string(),
    identity: z.object({
      product_names: z.array(z.string()),
      authoring_system: z.string().optional(),
      organization_name: z.string().optional(),
    }),
    size: z.object({
      bounding_box: z.object({}).passthrough(),
      dimensions: z.object({}).passthrough(),
      volume: z.number(),
      surface_area: z.number(),
      units: z.object({}).passthrough(),
    }),
    structure: z.object({
      body_count: z.number(),
      shape_type: z.string(),
      is_assembly: z.boolean(),
      product_count: z.number(),
      schema: z.string().optional(),
      application_protocol: z.string().optional(),
    }),
    health: z.object({
      is_valid: z.boolean().optional(),
      warning_count: z.number(),
      high_warning_count: z.number(),
      complexity: z.object({}).passthrough(),
    }),
    pmi: z.object({}).passthrough(),
    topology_summary: z.object({}).passthrough().optional(),
    geometry_extremes: z.object({}).passthrough().optional(),
    warnings: z.array(z.object({}).passthrough()),
    limitations: z.array(z.object({}).passthrough()),
  },
  findStepFaces: queryOutputSchema,
  findStepEdges: queryOutputSchema,
  getStepEntities: queryOutputSchema,
  compareStepFiles: compareOutputSchema,
  queryStepPmi: queryOutputSchema,
} as const;

export async function handleInspectStepFile(filePath: string) {
  return wrapTool(async () => {
    return withStepModel(filePath, async (model) => {
      const [brep, semantic] = await Promise.all([model.getBRepModel(), model.getSemanticModel()]);

      return {
        schema_version: CAD_RESPONSE_SCHEMA_VERSION,
        file_path: filePath,
        identity: {
          product_names: semantic.productNames,
          authoring_system: semantic.authoringSystem,
          organization_name: semantic.organizationName,
        },
        size: {
          bounding_box: brep.boundingBox,
          dimensions: brep.dimensions,
          volume: brep.volume,
          surface_area: brep.surfaceArea,
          units: brep.units,
        },
        structure: {
          body_count: brep.bodyCount,
          shape_type: brep.shapeType,
          is_assembly: semantic.hasAssembly,
          product_count: semantic.productCount,
          schema: semantic.schema,
          application_protocol: semantic.applicationProtocol,
        },
        health: {
          is_valid: brep.health.isValid,
          warning_count: brep.health.warnings.length,
          high_warning_count: brep.health.warnings.filter((w) => w.severity === 'high').length,
          complexity: {
            body_count: brep.bodyCount,
            face_count: brep.faceCount,
            edge_count: brep.edgeStatistics?.count,
          },
        },
        pmi: {
          has_pmi: semantic.pmi?.hasGdt || semantic.pmi?.hasDimensions || false,
          has_gdt: semantic.pmi?.hasGdt || false,
          has_dimensions: semantic.pmi?.hasDimensions || false,
          semantic_status: semantic.pmi?.semanticStatus || 'not_detected',
          tolerance_entity_count: semantic.toleranceEntityCount,
        },
        topology_summary: {
          faces: {
            total: brep.faceCount,
          },
          edges: brep.edgeStatistics
            ? {
                total: brep.edgeStatistics.count,
                by_curve_type: brep.edgeStatistics.byCurveType,
                by_length_bucket: brep.edgeStatistics.byLengthRange,
                length_range: {
                  min: brep.edgeStatistics.minLength,
                  max: brep.edgeStatistics.maxLength,
                },
              }
            : undefined,
        },
        geometry_extremes: {
          edges_length_lt_1_mm: brep.edgeStatistics ? brep.edgeStatistics.byLengthRange.tiny : 0,
          min_edge_length: brep.edgeStatistics?.minLength || 0,
        },
        warnings: brep.health.warnings,
        limitations: [
          ...semantic.limitations,
          {
            source: 'inspect_step_file',
            message:
              'Face area extremes, surface-type counts, and adjacency graph are deferred. Use find_step_faces or find_step_edges with specific fields for those details.',
          },
        ],
      };
    });
  });
}

export async function handleFindStepFaces(
  filePath: string,
  query: Record<string, unknown> | undefined
) {
  return wrapTool(async () =>
    queryFacesService(
      filePath,
      adaptFindStepFaces(query as Partial<PublicFindStepFacesInput> | undefined)
    )
  );
}

export async function handleFindStepEdges(
  filePath: string,
  query: Record<string, unknown> | undefined
) {
  return wrapTool(async () =>
    queryEdgesService(
      filePath,
      adaptFindStepEdges(query as Partial<PublicFindStepEdgesInput> | undefined)
    )
  );
}

export async function handleGetStepEntities(
  filePath: string,
  query: Record<string, unknown> | undefined
) {
  return wrapTool(async () => {
    const publicQuery = query as Partial<PublicGetStepEntitiesInput> | undefined;
    if (!publicQuery?.entity_type) throw invalidInput('entity_type is required.');
    if (!publicQuery.entity_ids || publicQuery.entity_ids.length === 0) {
      throw invalidInput('entity_ids is required and must contain at least one ID.');
    }

    if (publicQuery.entity_type === 'face') {
      validateEntityIds(publicQuery.entity_ids, 'face');
      validateEntityFields(publicQuery.fields, 'face');
      if (canDirectGetEntities(publicQuery as PublicGetStepEntitiesInput)) {
        return getStepEntitiesDirect(filePath, publicQuery as PublicGetStepEntitiesInput);
      }
      return queryFacesService(filePath, adaptGetStepFaces(publicQuery));
    }

    validateEntityIds(publicQuery.entity_ids, 'edge');
    validateEntityFields(publicQuery.fields, 'edge');
    if (canDirectGetEntities(publicQuery as PublicGetStepEntitiesInput)) {
      return getStepEntitiesDirect(filePath, publicQuery as PublicGetStepEntitiesInput);
    }
    return queryEdgesService(filePath, adaptGetStepEdges(publicQuery));
  });
}

export async function handleCompareStepFiles(fileA: string, fileB: string) {
  return wrapTool(async () => compareStepFiles(fileA, fileB));
}

export async function handleQueryStepPmi(
  filePath: string,
  query: Record<string, unknown> | undefined
) {
  return wrapTool(async () =>
    queryPmiService(filePath, adaptPmiQuery(query as Partial<PublicQueryStepPmiInput> | undefined))
  );
}

export function adaptFindStepFaces(
  query: Partial<PublicFindStepFacesInput> | undefined
): QueryStepFacesInput {
  if (!boundedRange({ min: query?.area_min, max: query?.area_max })) {
    throw invalidInput('area_min must be less than or equal to area_max.');
  }

  return {
    filter: {
      body_ids: query?.body_ids,
      surface_type: query?.surface_types,
      area_min: query?.area_min,
      area_max: query?.area_max,
      normal_parallel_to: query?.normal?.parallel_to,
      normal_tolerance_degrees: query?.normal?.tolerance_degrees,
    },
    include: mapBboxCenter(query?.fields),
    group_by: query?.group_by,
    sort: query?.sort,
    result_mode: query?.return_type,
    limit: query?.limit,
    offset: query?.offset,
  };
}

export function adaptFindStepEdges(
  query: Partial<PublicFindStepEdgesInput> | undefined
): QueryStepEdgesInput {
  if (!boundedRange({ min: query?.length_min, max: query?.length_max })) {
    throw invalidInput('length_min must be less than or equal to length_max.');
  }
  if (!boundedRange({ min: query?.radius?.min, max: query?.radius?.max })) {
    throw invalidInput('radius.min must be less than or equal to radius.max.');
  }

  return {
    filter: {
      body_ids: query?.body_ids,
      curve_type: query?.curve_types,
      length_min: query?.length_min,
      length_max: query?.length_max,
      radius_min: query?.radius?.min,
      radius_max: query?.radius?.max,
    },
    include: mapBboxCenter(query?.fields),
    group_by: query?.group_by,
    sort: query?.sort,
    result_mode: query?.return_type,
    limit: query?.limit,
    offset: query?.offset,
  };
}

function adaptGetStepFaces(query: Partial<PublicGetStepEntitiesInput>): QueryStepFacesInput {
  return {
    filter: { entity_ids: query.entity_ids },
    include: mapBboxCenter(query.fields),
    group_by: undefined,
    sort: undefined,
    result_mode: 'entities',
    limit: query.entity_ids?.length,
    offset: 0,
  };
}

function adaptGetStepEdges(query: Partial<PublicGetStepEntitiesInput>): QueryStepEdgesInput {
  return {
    filter: { entity_ids: query.entity_ids },
    include: mapBboxCenter(query.fields),
    group_by: undefined,
    sort: undefined,
    result_mode: 'entities',
    limit: query.entity_ids?.length,
    offset: 0,
  };
}

export function adaptPmiQuery(
  query: Partial<PublicQueryStepPmiInput> | undefined
): QueryStepPmiInput {
  if (!boundedRange({ min: query?.value_min, max: query?.value_max })) {
    throw invalidInput('value_min must be less than or equal to value_max.');
  }

  return {
    filter: {
      pmi_types: query?.pmi_types,
      tolerance_types: query?.tolerance_subtypes,
      value_min: query?.value_min,
      value_max: query?.value_max,
    },
    group_by: query?.group_by,
    sort: query?.sort,
    result_mode: query?.return_type,
    limit: query?.limit,
    offset: query?.offset,
  };
}

function validateEntityIds(entityIds: string[], entityType: 'face' | 'edge'): void {
  const valid = entityIds.every((id) =>
    entityType === 'face' ? /^face:\d+$/.test(id) : /^edge:\d+$/.test(id)
  );
  if (!valid) throw invalidInput(`All entity_ids must match ${entityType}:N.`);
}

function validateEntityFields(
  fields: PublicGetStepEntitiesInput['fields'],
  entityType: 'face' | 'edge'
): void {
  if (!fields) return;
  const allowed = entityType === 'face' ? FACE_GET_FIELDS : EDGE_GET_FIELDS;
  const invalid = fields.filter((field) => !allowed.has(field));
  if (invalid.length > 0) {
    throw invalidInput(`Invalid ${entityType} fields: ${invalid.join(', ')}.`);
  }
}

function invalidInput(message: string) {
  return { type: 'invalid_input', message };
}

type InputFromShape<T extends Record<string, z.ZodType>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type QueryStepFacesInput = InputFromShape<typeof internalFaceQuerySchema>;
export type QueryStepEdgesInput = InputFromShape<typeof internalEdgeQuerySchema>;
export type QueryStepPmiInput = InputFromShape<typeof internalPmiQuerySchema>;
type PublicFindStepFacesInput = InputFromShape<typeof findStepFacesSchema>;
type PublicFindStepEdgesInput = InputFromShape<typeof findStepEdgesSchema>;
export type PublicGetStepEntitiesInput = InputFromShape<typeof getStepEntitiesSchema>;
type PublicQueryStepPmiInput = InputFromShape<typeof pmiQuerySchema>;

export interface StepQueryUnits {
  length: 'mm';
  area: 'mm^2';
  volume: 'mm^3';
  angle: 'deg';
}

export interface StepQueryCoordinateSystem {
  origin: 'STEP model origin';
  axes: 'model coordinates';
  handedness: 'right';
}

export interface StepQueryPagination {
  limit: number;
  offset: number;
  returned: number;
  total_matched: number;
  has_more: boolean;
}

export interface StepQueryGroup {
  id: string;
  key: Record<string, unknown>;
  entity_count: number;
  sample_entity_ids: string[];
  sample_entity_limit: number;
  sample_is_complete: boolean;
  summary: Record<string, unknown>;
}

export interface StepQueryResponse<TEntity extends Record<string, unknown>> {
  schema_version: typeof CAD_RESPONSE_SCHEMA_VERSION;
  file_path: string;
  units: StepQueryUnits;
  coordinate_system: StepQueryCoordinateSystem;
  query: Record<string, unknown>;
  statistics: Record<string, unknown>;
  pagination: StepQueryPagination;
  entities: TEntity[];
  groups: StepQueryGroup[];
  warnings: unknown[];
  limitations: unknown[];
}
