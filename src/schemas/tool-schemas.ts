import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Common primitive schemas                                           */
/* ------------------------------------------------------------------ */

const nonEmpty = z.string().min(1);

export const filePathSchema = nonEmpty.describe(
  "Absolute or relative path to the STEP file on the local filesystem. Paths resolve from the server's working directory. For files > 100MB, the call may take several seconds; do not chain with other inspect calls.",
);

const point3Schema = z.array(z.number().finite()).length(3);

const directionOrShortcutSchema = z.union([
  z.array(z.number()).length(3),
  z.enum(['along_axis', 'along_axis_both', 'normal']),
]);

const originOrShortcutSchema = z.union([
  z.array(z.number()).length(3),
  z.enum(['extent_min', 'extent_center', 'extent_max']),
]);

const bodyIdSchema = z.string().refine((id) => {
  const [type, index, extra] = id.split(':');
  if (extra !== undefined || type !== 'body' || !index) return false;
  const n = Number(index);
  return Number.isInteger(n) && n >= 0 && String(n) === index;
}, 'Body IDs must match body:N.');

export const entityIdSchema = z
  .string()
  .refine((id) => {
    const parts = id.split(':');
    if (parts.length !== 2) return false;
    const [type, index] = parts;
    if (!['face', 'edge', 'vertex', 'body'].includes(type)) return false;
    const n = Number(index);
    return Number.isInteger(n) && n >= 0 && String(n) === index;
  }, 'Entity IDs must match face:N, edge:N, vertex:N, or body:N.')
  .describe('Entity ID. Pattern: "face:N", "edge:N", "vertex:N", or "body:N".');

const faceOrEdgeIdSchema = entityIdSchema.refine(
  (id) => id.startsWith('face:') || id.startsWith('edge:'),
  'Must be a face:N or edge:N ID from a prior query result.',
);

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const SURFACE_TYPES = [
  'plane',
  'cylinder',
  'cone',
  'sphere',
  'torus',
  'bspline',
  'other',
] as const;

export const CURVE_TYPES = ['line', 'circle', 'ellipse', 'bspline', 'other'] as const;

export const RETURN_TYPES = ['entities', 'summary', 'groups'] as const;

export const MEASURE_OPS = [
  'ray_test',
  'ray_test_grid',
  'ray_test_segment',
  'distance',
  'distance_extrema',
  'section_by_plane',
  'curvature_at_param',
  'continuity',
  'principal_directions',
  'closest_point_on_face',
  'classify_point',
] as const;

/* ------------------------------------------------------------------ */
/*  Aggregate spec                                                     */
/* ------------------------------------------------------------------ */

const aggregateSpec = z
  .string()
  .regex(
    /^(count|min|max|avg|stddev|sum)(:[a-z_]+)?$/,
    'Format: <op>[:<field>]. Examples: "count", "min:area", "max:radius".',
  )
  .describe(
    'Statistics over the result set. Format: <op>[:<field>]. Ops: count, min, max, avg, stddev, sum. Examples: "count", "min:area", "max:radius", "avg:hit_distance".',
  );

/* ------------------------------------------------------------------ */
/*  inspect_step (unchanged)                                           */
/* ------------------------------------------------------------------ */

export const inspectStepInputSchema = {
  file_path: filePathSchema,
};

export const inspectStepSchema = z.object(inspectStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  diff_step (unchanged)                                              */
/* ------------------------------------------------------------------ */

export const diffStepInputSchema = {
  baseline_file_path: nonEmpty.describe('Absolute or relative path to the baseline STEP file.'),
  comparison_file_path: nonEmpty.describe('Absolute or relative path to the comparison STEP file.'),
};

export const diffStepSchema = z.object(diffStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  query_faces                                                        */
/* ------------------------------------------------------------------ */

export const queryFacesInputSchema = {
  file_path: filePathSchema,

  surface_type: z
    .enum(SURFACE_TYPES)
    .optional()
    .describe(
      'Filter by face surface type: "plane", "cylinder", "cone", "sphere", "torus", "bspline", "other".',
    ),

  area_min: z
    .number()
    .nonnegative()
    .optional()
    .describe('Minimum face area in mm^2. Omit for no lower bound.'),

  area_max: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum face area in mm^2. Omit for no upper bound.'),

  radius_min: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Minimum radius in mm for cylindrical/conical/spherical faces. Omit for no lower bound.',
    ),

  radius_max: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Maximum radius in mm for cylindrical/conical/spherical faces. Omit for no upper bound.',
    ),

  body_ids: z
    .array(bodyIdSchema)
    .optional()
    .describe('Restrict to specific bodies (e.g. ["body:0"]). Omit to search all bodies.'),

  group_by: z
    .array(z.enum(['axis', 'surface_type', 'area_range', 'radius_range', 'body_id']))
    .min(1)
    .max(3)
    .optional()
    .describe(
      'Cluster faces by a shared property. "axis" groups cylindrical/conical faces by their axis direction. "surface_type" groups by geometry type. "area_range" / "radius_range" group into size buckets.',
    ),

  select: z
    .array(z.string())
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Fields to include per face. Default: id, surface_type, area, bbox, bbox_center, body_id. Common extras: radius, diameter, axis, normal, extent_along_axis.',
    ),

  order_by: z
    .object({
      by: z
        .string()
        .describe(
          'Field to sort by: "area", "radius", "surface_type", "center_x", "center_y", "center_z".',
        ),
      direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction. Default asc.'),
    })
    .strict()
    .optional(),

  aggregate: z
    .array(aggregateSpec)
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Statistical aggregates over matched faces. Examples: "count", "min:radius", "max:area", "avg:diameter".',
    ),

  return_type: z
    .enum(RETURN_TYPES)
    .default('entities')
    .describe(
      '"entities" returns paginated faces. "summary" returns statistics only (no entity details). "groups" returns group counts with sample IDs (requires group_by).',
    ),

  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Maximum faces to return. Default 100, max 1000.'),

  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Skip this many faces before returning. Default 0.'),
};

export const queryFacesSchema = z.object(queryFacesInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  query_edges                                                        */
/* ------------------------------------------------------------------ */

export const queryEdgesInputSchema = {
  file_path: filePathSchema,

  curve_type: z
    .enum(CURVE_TYPES)
    .optional()
    .describe(
      'Filter by edge curve type: "line" (straight), "circle" (holes/fillets), "ellipse", "bspline" (freeform), "other".',
    ),

  length_min: z
    .number()
    .nonnegative()
    .optional()
    .describe('Minimum edge length in mm. Omit for no lower bound.'),

  length_max: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum edge length in mm. Omit for no upper bound.'),

  radius_min: z
    .number()
    .nonnegative()
    .optional()
    .describe('Minimum radius in mm for circular edges. Omit for no lower bound.'),

  radius_max: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum radius in mm for circular edges. Omit for no upper bound.'),

  body_ids: z
    .array(bodyIdSchema)
    .optional()
    .describe('Restrict to specific bodies (e.g. ["body:0"]). Omit to search all bodies.'),

  group_by: z
    .array(z.enum(['curve_type', 'length_range', 'radius_range', 'body_id']))
    .min(1)
    .max(3)
    .optional()
    .describe(
      'Cluster edges by a shared property. "curve_type" groups by curve class. "length_range" / "radius_range" group into size buckets.',
    ),

  select: z
    .array(z.string())
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Fields to include per edge. Default: id, curve_type, length, bbox, bbox_center, body_id. Common extras: radius, diameter, start_point, end_point.',
    ),

  order_by: z
    .object({
      by: z
        .string()
        .describe(
          'Field to sort by: "length", "radius", "curve_type", "center_x", "center_y", "center_z".',
        ),
      direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction. Default asc.'),
    })
    .strict()
    .optional(),

  aggregate: z
    .array(aggregateSpec)
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Statistical aggregates over matched edges. Examples: "count", "min:radius", "max:length", "avg:diameter".',
    ),

  return_type: z
    .enum(RETURN_TYPES)
    .default('entities')
    .describe(
      '"entities" returns paginated edges. "summary" returns statistics only. "groups" returns group counts with sample IDs (requires group_by).',
    ),

  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Maximum edges to return. Default 100, max 1000.'),

  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Skip this many edges before returning. Default 0.'),
};

export const queryEdgesSchema = z.object(queryEdgesInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  measure_step                                                       */
/* ------------------------------------------------------------------ */

export const measureStepInputSchema = z
  .object({
    file_path: filePathSchema,

    entity_ids: z
      .array(faceOrEdgeIdSchema)
      .min(1)
      .max(500)
      .describe(
        'Entity IDs to measure. Use IDs returned by query_faces or query_edges. You can pass multiple IDs to batch-measure in one call.',
      ),

    op: z
      .enum(MEASURE_OPS)
      .describe(
        'Measurement operation. Choose based on what you need to measure. Only fill parameters relevant to your chosen op.',
      ),

    direction: directionOrShortcutSchema
      .optional()
      .describe(
        'For ray_test, ray_test_grid, ray_test_segment: ray direction [x,y,z] or shortcut "along_axis"/"along_axis_both"/"normal".',
      ),

    origin: originOrShortcutSchema
      .optional()
      .describe(
        'For ray_test_segment: ray origin. A 3D point, or "extent_min"/"extent_center"/"extent_max" relative to each entity.',
      ),

    tmax: z
      .number()
      .positive()
      .optional()
      .describe('For ray_test_segment: maximum ray distance in mm.'),

    spacing_mm: z
      .number()
      .positive()
      .default(2.0)
      .optional()
      .describe('For ray_test_grid: distance between grid rays in mm. Default 2.0.'),

    to: z
      .union([faceOrEdgeIdSchema, z.array(faceOrEdgeIdSchema).min(1).max(100)])
      .optional()
      .describe(
        'For distance, distance_extrema: target entity ID(s). Single: "face:5". Multiple: ["face:5", "edge:0"].',
      ),

    plane_origin: point3Schema
      .optional()
      .describe('For section_by_plane: a point on the cutting plane.'),

    plane_normal: point3Schema
      .optional()
      .describe('For section_by_plane: normal vector of the cutting plane.'),

    param: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('For curvature_at_param: parameter along the curve (0=start, 1=end).'),

    with: faceOrEdgeIdSchema
      .optional()
      .describe('For continuity: the other entity to check continuity against.'),

    point: point3Schema
      .optional()
      .describe('For classify_point, closest_point_on_face: 3D point to classify or project.'),

    tolerance: z
      .number()
      .nonnegative()
      .default(0.01)
      .optional()
      .describe('Tolerance in mm. Default 0.01.'),

    detail_level: z
      .enum(['aggregate', 'summary', 'points'])
      .default('aggregate')
      .optional()
      .describe(
        '"aggregate" returns min/max/avg only. "summary" adds histograms. "points" returns full hit coordinates.',
      ),
  })
  .strict();

export type MeasureStepInput = z.infer<typeof measureStepInputSchema>;

export const toolSchemas = {
  inspect_step: inspectStepSchema,
  query_faces: queryFacesSchema,
  query_edges: queryEdgesSchema,
  measure_step: measureStepInputSchema,
  diff_step: diffStepSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;
