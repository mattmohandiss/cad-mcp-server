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

const measureBase = {
  file_path: filePathSchema,

  entity_ids: z
    .array(faceOrEdgeIdSchema)
    .min(1)
    .max(500)
    .describe(
      'Entity IDs to measure. Use IDs returned by query_faces or query_edges. You can pass multiple IDs to batch-measure in one call.',
    ),

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
      '"aggregate" returns min/max/avg/median only. "summary" adds histograms. "points" returns full hit point coordinates. Use "aggregate" by default; request "points" only when you need exact locations.',
    ),
};

const rayTestOps = z.discriminatedUnion('op', [
  z.object({
    ...measureBase,
    op: z.literal('ray_test'),
    direction: directionOrShortcutSchema.describe(
      'Ray direction vector [x,y,z], or shortcut: "along_axis" (along each entity\'s axis), "along_axis_both" (both directions), "normal" (each entity\'s normal).',
    ),
  }),

  z.object({
    ...measureBase,
    op: z.literal('ray_test_segment'),
    direction: directionOrShortcutSchema.describe(
      'Ray direction. Shortcuts "along_axis", "along_axis_both", "normal" supported.',
    ),
    origin: originOrShortcutSchema.describe(
      'Ray origin: a 3D point, or "extent_min"/"extent_center"/"extent_max" relative to each entity.',
    ),
    tmax: z
      .number()
      .positive()
      .optional()
      .describe('Maximum ray distance in mm. If a face is 20mm thick, set tmax just above 20.'),
  }),

  z.object({
    ...measureBase,
    op: z.literal('ray_test_grid'),
    direction: directionOrShortcutSchema.describe(
      'Grid direction. Shortcuts "along_axis", "along_axis_both", "normal" supported.',
    ),
    spacing_mm: z
      .number()
      .positive()
      .default(2.0)
      .optional()
      .describe('Distance between grid rays in mm. Smaller = more samples, slower. Default 2.0.'),
  }),
]);

const distanceOps = z.discriminatedUnion('op', [
  z.object({
    ...measureBase,
    op: z.literal('distance'),
    to: z
      .union([faceOrEdgeIdSchema, z.array(faceOrEdgeIdSchema).min(1).max(100)])
      .describe(
        'Target entity ID(s) to compute distance to. Single ID: "face:5". Multiple: ["face:5", "edge:0"].',
      ),
  }),

  z.object({
    ...measureBase,
    op: z.literal('distance_extrema'),
    to: z
      .union([faceOrEdgeIdSchema, z.array(faceOrEdgeIdSchema).min(1).max(100)])
      .describe('Target entity ID(s) for min/max distance computation.'),
  }),
]);

const sectionOps = z.discriminatedUnion('op', [
  z.object({
    ...measureBase,
    op: z.literal('section_by_plane'),
    plane_origin: point3Schema.describe('A point on the cutting plane.'),
    plane_normal: point3Schema.describe('Normal vector of the cutting plane.'),
  }),
]);

const pointOps = z.discriminatedUnion('op', [
  z.object({
    ...measureBase,
    op: z.literal('classify_point'),
    point: point3Schema.describe('3D point to classify as IN, ON, or OUT relative to the entity.'),
  }),

  z.object({
    ...measureBase,
    op: z.literal('closest_point_on_face'),
    point: point3Schema.describe('3D point to project onto the face.'),
  }),
]);

const curveOps = z.discriminatedUnion('op', [
  z.object({
    ...measureBase,
    op: z.literal('curvature_at_param'),
    param: z
      .number()
      .min(0)
      .max(1)
      .describe('Parameter value along the curve (0 = start, 1 = end).'),
  }),

  z.object({
    ...measureBase,
    op: z.literal('continuity'),
    with: faceOrEdgeIdSchema.describe('The other entity to check continuity against.'),
  }),

  z.object({
    ...measureBase,
    op: z.literal('principal_directions'),
  }),
]);

export const measureStepInputSchema = rayTestOps
  .or(distanceOps)
  .or(sectionOps)
  .or(pointOps)
  .or(curveOps);

export type MeasureStepInput = z.infer<typeof measureStepInputSchema>;

/* ------------------------------------------------------------------ */
/*  Schema registry                                                    */
/* ------------------------------------------------------------------ */

export const toolSchemas = {
  inspect_step: inspectStepSchema,
  query_faces: queryFacesSchema,
  query_edges: queryEdgesSchema,
  measure_step: measureStepInputSchema,
  diff_step: diffStepSchema,
} as const;

export const toolInputSchemas = {
  inspect_step: inspectStepInputSchema,
  query_faces: queryFacesInputSchema,
  query_edges: queryEdgesInputSchema,
  measure_step: measureStepInputSchema,
  diff_step: diffStepInputSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;
