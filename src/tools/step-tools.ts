import { z } from 'zod';
import { compareStepFiles } from '../cad/compare.js';
import { analyzeStepFile } from '../cad/analyze.js';
import { inspectProjection } from '../cad/projections.js';
import { queryStepEdges as queryEdgesService } from '../cad/query/edges.js';
import { queryStepFaces as queryFacesService } from '../cad/query/faces.js';
import { queryStepPmi as queryPmiService } from '../cad/query/pmi.js';
import { wrapTool } from './shared.js';

const stepFileInput = {
  file_path: z.string().min(1).describe('Absolute or relative path to the STEP file to query'),
};

const point3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const direction3Schema = point3Schema.refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, {
  message: 'Direction vector must be non-zero.',
});

function uniqueArray<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

function boundedRange(input: { min?: number; max?: number }): boolean {
  return input.min === undefined || input.max === undefined || input.min <= input.max;
}

const bboxSchema = z
  .object({
    min: point3Schema,
    max: point3Schema,
  })
  .strict()
  .refine(
    ({ min, max }) => min[0] <= max[0] && min[1] <= max[1] && min[2] <= max[2],
    'Bounding box min values must be less than or equal to max values.'
  );

const resultModeSchema = z
  .enum(['summary', 'entities', 'groups'])
  .describe(
    'Shape of the result object. "summary" = statistics and counts only, no entity list (fastest, fewest tokens). "entities" (default) = paginated entity list with projections. "groups" = aggregate the matched entities into groups (requires group_by; returns counts plus sample entity IDs per group). Use "summary" or "groups" first in a conversation, then drill into specific entities.'
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
const sampleEntityLimitSchema = z
  .number()
  .int()
  .nonnegative()
  .max(50)
  .describe(
    'Maximum number of example entity IDs to include per group (used with result_mode "groups"). Default: 5. Max: 50. Set 0 to omit samples.'
  )
  .optional();

const regionSchema = z
  .object({
    bbox: bboxSchema.describe(
      'Bounding box filter with min and max [x, y, z] corners. All coordinates in model units (typically mm). Each component of min must be <= corresponding max component.'
    ),
    mode: z
      .enum(['intersects', 'contained', 'contains_center'])
      .describe(
        '"intersects" (default) = geometry overlaps or touches the box. "contained" = entire geometry must be inside the box. "contains_center" = geometry center point must be inside the box. Use "contains_center" for point-in-region queries.'
      )
      .optional(),
  })
  .strict()
  .optional();

const nearSchema = z
  .object({
    point: point3Schema.describe(
      'Reference point [x, y, z] in model coordinates and units (typically mm). Example: [0, 0, 0] for origin, [100, 50, 25] for a specific location.'
    ),
    distance: z
      .number()
      .nonnegative()
      .describe(
        'Search radius around the point in model units (typically mm). Returns entities whose center is within this distance. E.g., distance: 10 searches within 10mm of the point.'
      ),
  })
  .strict()
  .optional();

const faceIncludeSchema = z
  .array(
    z
      .enum([
        'id',
        'surface_type',
        'area',
        'bbox',
        'center',
        'normal',
        'surface_parameters',
        'adjacent_faces',
        'closest_face_distance',
        'has_inner_wires',
        'body_id',
      ])
      .describe(
        'Face projection fields: id=unique identifier, surface_type=geometry type, area=surface area mm^2, bbox=bounding box, center=centroid, normal=surface normal direction, surface_parameters=raw OCCT surface data (e.g. cylinder radius), adjacent_faces=list of adjacent faces with cross-face vexity and dihedral angle, closest_face_distance=minimum distance to any other face in the model, has_inner_wires=whether the face boundary contains interior wire(s) (holes/openings), body_id=which body this face belongs to (body:0, body:1, ...). Default: id,surface_type,area,bbox,center.'
      )
  )
  .min(1)
  .max(11)
  .refine(uniqueArray, 'Include values must be unique.')
  .describe(
    'List of face properties to include in results. Omit to get default projection (id, surface_type, area, bbox, center).'
  )
  .optional();

const edgeIncludeSchema = z
  .array(
    z
      .enum([
        'id',
        'curve_type',
        'length',
        'bbox',
        'center',
        'radius',
        'start_point',
        'end_point',
        'adjacent_faces',
        'body_id',
      ])
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

const faceGroupBySchema = z
  .array(
    z
      .enum(['surface_type', 'normal_direction', 'area_range', 'radius'])
      .describe(
        'Grouping dimension: surface_type=plane/cylinder/cone/etc; normal_direction=nearest principal axis (+X..-Z within 15 degrees, else off-axis); area_range=fixed log-scale size bucket in mm^2 (0-1, 1-10, 10-100, ...); radius=rounded to 0.5mm (cylindrical faces only).'
      )
  )
  .min(1)
  .max(4)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe(
    'List of dimensions to group faces by; required when result_mode is "groups". E.g., ["surface_type"] groups by geometry type. Combining dimensions produces one group per distinct key combination. Bucket widths are fixed by the server.'
  )
  .optional();

const edgeGroupBySchema = z
  .array(
    z
      .enum(['curve_type', 'length_range'])
      .describe(
        'Grouping dimension: curve_type=line/circle/ellipse/bspline/other; length_range=fixed log-scale length bucket in mm (0-1, 1-10, 10-100, ...). The 0-1 length_range bucket isolates tiny/degenerate edges.'
      )
  )
  .min(1)
  .max(2)
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

const faceQuerySchema = {
  ...stepFileInput,
  filter: faceFilterSchema.optional(),
  region: regionSchema,
  near: nearSchema,
  include: faceIncludeSchema,
  group_by: faceGroupBySchema,
  sort: faceSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
  sample_entity_limit: sampleEntityLimitSchema,
};

const edgeQuerySchema = {
  ...stepFileInput,
  filter: edgeFilterSchema.optional(),
  region: regionSchema,
  near: nearSchema,
  include: edgeIncludeSchema,
  group_by: edgeGroupBySchema,
  sort: edgeSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
  sample_entity_limit: sampleEntityLimitSchema,
};

/* ------------------------------------------------------------------ */
/*  PMI query schema                                                   */
/* ------------------------------------------------------------------ */

const pmiTypeSchema = z
  .enum(['geometric_tolerance', 'dimension', 'datum', 'annotation'])
  .describe('PMI entity type category');

const toleranceSubtypeSchema = z
  .enum([
    'position', 'flatness', 'straightness', 'circularity', 'cylindricity',
    'profile', 'parallelism', 'perpendicularity', 'angularity', 'concentricity',
    'runout', 'symmetry', 'coaxiality', 'circular_runout', 'total_runout',
    'surface_profile', 'line_profile',
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
      .describe('Sort field: type=entity category (alphabetic), value= tolerance/dimension value, tolerance_type=geometric tolerance subtype'),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .optional();

const pmiQuerySchema = {
  ...stepFileInput,
  filter: pmiFilterSchema.optional(),
  group_by: pmiGroupBySchema,
  sort: pmiSortSchema,
  result_mode: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
  sample_entity_limit: sampleEntityLimitSchema,
};

export const stepToolSchemas = {
  inspectStepFile: stepFileInput,
  queryStepFaces: faceQuerySchema,
  queryStepEdges: edgeQuerySchema,
  compareStepFiles: {
    file_a: z.string().min(1).describe('Absolute or relative path to the baseline STEP file'),
    file_b: z.string().min(1).describe('Absolute or relative path to the comparison STEP file'),
  },
  queryStepPmi: pmiQuerySchema,
} as const;

export async function handleInspectStepFile(filePath: string) {
  return wrapTool(async () => inspectProjection(await analyzeStepFile(filePath)));
}

export async function handleQueryStepFaces(
  filePath: string,
  query: Partial<QueryStepFacesInput> | undefined
) {
  return wrapTool(async () => queryFacesService(filePath, query as QueryStepFacesInput));
}

export async function handleQueryStepEdges(
  filePath: string,
  query: Partial<QueryStepEdgesInput> | undefined
) {
  return wrapTool(async () => queryEdgesService(filePath, query as QueryStepEdgesInput));
}

export async function handleCompareStepFiles(fileA: string, fileB: string) {
  return wrapTool(async () => compareStepFiles(fileA, fileB));
}

export async function handleQueryStepPmi(
  filePath: string,
  query: Partial<QueryStepPmiInput> | undefined
) {
  return wrapTool(async () => queryPmiService(filePath, query as QueryStepPmiInput));
}

type InputFromShape<T extends Record<string, z.ZodType>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type QueryStepFacesInput = InputFromShape<typeof faceQuerySchema>;
export type QueryStepEdgesInput = InputFromShape<typeof edgeQuerySchema>;
export type QueryStepPmiInput = InputFromShape<typeof pmiQuerySchema>;

export interface NotImplementedData {
  filePath: string;
  toolName: string;
}

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
  schema_version: '0.3';
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
