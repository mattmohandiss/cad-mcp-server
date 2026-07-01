import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Common primitive schemas                                           */
/* ------------------------------------------------------------------ */

const nonEmpty = z.string().min(1);

export const filePathSchema = nonEmpty.describe('Path to STEP file on local filesystem.');

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
  .describe('Entity ID: "face:N", "edge:N", "vertex:N", or "body:N".');

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
  'draft_angle',
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
    'Format: <op>[:<field>]. Examples: "count", "min:area".',
  )
  .describe('Stats: count, min:field, max:field, avg:field, stddev:field, sum:field.');

/* ------------------------------------------------------------------ */
/*  inspect_step                                                       */
/* ------------------------------------------------------------------ */

export const inspectStepInputSchema = {
  file_path: filePathSchema,
};

export const inspectStepSchema = z.object(inspectStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  diff_step                                                          */
/* ------------------------------------------------------------------ */

export const diffStepInputSchema = {
  baseline_file_path: nonEmpty.describe('Path to baseline STEP file.'),
  comparison_file_path: nonEmpty.describe('Path to comparison STEP file.'),
};

export const diffStepSchema = z.object(diffStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  query_faces                                                        */
/* ------------------------------------------------------------------ */

export const queryFacesInputSchema = {
  file_path: filePathSchema,

  surface_type: z.enum(SURFACE_TYPES).optional().describe('Face surface type. Omit for all types.'),

  area_min: z.number().nonnegative().optional().describe('Min face area (mm²).'),

  area_max: z.number().nonnegative().optional().describe('Max face area (mm²).'),

  radius_min: z.number().nonnegative().optional().describe('Min radius (mm).'),

  radius_max: z.number().nonnegative().optional().describe('Max radius (mm).'),

  body_ids: z
    .array(bodyIdSchema)
    .optional()
    .describe('Restrict to specific bodies. Omit for all bodies.'),

  group_by: z
    .array(z.enum(['axis', 'surface_type', 'area_range', 'radius_range', 'body_id']))
    .min(1)
    .max(3)
    .optional()
    .describe('Cluster faces by axis, surface_type, area_range, radius_range, or body_id.'),

  select: z
    .array(z.string())
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Fields to return. Default: id, surface_type, area, bbox, bbox_center, body_id, adjacent_faces. Extras: radius, diameter, axis, normal.',
    ),

  order_by: z
    .object({
      by: z
        .string()
        .describe('Sort field: area, radius, surface_type, center_x, center_y, center_z.'),
      direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction.'),
    })
    .strict()
    .optional(),

  aggregate: z
    .array(aggregateSpec)
    .min(1)
    .max(20)
    .optional()
    .describe('Stats: "count", "min:radius", "max:area", "avg:diameter", etc.'),

  return_type: z
    .enum(RETURN_TYPES)
    .default('entities')
    .describe('entities | summary | groups (groups needs group_by).'),

  limit: z.number().int().min(1).max(1000).default(100).describe('Max results. Default 100.'),

  offset: z.number().int().min(0).default(0).describe('Skip N results.'),
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
    .describe('Edge curve type. "circle" = fillets/holes, "line" = straight. Omit for all.'),

  length_min: z.number().nonnegative().optional().describe('Min edge length (mm).'),

  length_max: z.number().nonnegative().optional().describe('Max edge length (mm).'),

  radius_min: z.number().nonnegative().optional().describe('Min radius for circular edges (mm).'),

  radius_max: z.number().nonnegative().optional().describe('Max radius for circular edges (mm).'),

  body_ids: z
    .array(bodyIdSchema)
    .optional()
    .describe('Restrict to specific bodies. Omit for all bodies.'),

  group_by: z
    .array(z.enum(['curve_type', 'length_range', 'radius_range', 'body_id']))
    .min(1)
    .max(3)
    .optional()
    .describe('Cluster by curve_type, length_range, radius_range, or body_id.'),

  select: z
    .array(z.string())
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Fields to return. Default: id, curve_type, length, bbox, bbox_center, body_id. Extras: radius, diameter, start_point, end_point.',
    ),

  order_by: z
    .object({
      by: z
        .string()
        .describe('Sort field: length, radius, curve_type, center_x, center_y, center_z.'),
      direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction.'),
    })
    .strict()
    .optional(),

  aggregate: z
    .array(aggregateSpec)
    .min(1)
    .max(20)
    .optional()
    .describe('Stats: "count", "min:radius", "max:length", "avg:diameter", etc.'),

  return_type: z
    .enum(RETURN_TYPES)
    .default('entities')
    .describe('entities | summary | groups (groups needs group_by).'),

  limit: z.number().int().min(1).max(1000).default(100).describe('Max results. Default 100.'),

  offset: z.number().int().min(0).default(0).describe('Skip N results.'),
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
      .describe('Face or edge IDs from query_faces/query_edges. Batch by passing multiple IDs.'),

    op: z.enum(MEASURE_OPS).describe('Measurement op. Only fill parameters needed for this op.'),

    direction: directionOrShortcutSchema
      .optional()
      .describe(
        'Ray direction or draft pull direction [x,y,z]. Shortcuts: along_axis, along_axis_both, normal.',
      ),

    origin: originOrShortcutSchema
      .optional()
      .describe('Ray origin: 3D point or extent_min/center/max (ray_test_segment).'),

    tmax: z.number().positive().optional().describe('Max ray distance mm (ray_test_segment).'),

    spacing_mm: z
      .number()
      .positive()
      .default(2.0)
      .optional()
      .describe('Grid spacing mm (ray_test_grid).'),

    to: z
      .union([faceOrEdgeIdSchema, z.array(faceOrEdgeIdSchema).min(1).max(100)])
      .optional()
      .describe('Target entity ID(s) for distance op.'),

    plane_origin: point3Schema.optional().describe('Point on cutting plane (section_by_plane).'),

    plane_normal: point3Schema.optional().describe('Normal of cutting plane (section_by_plane).'),

    param: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Curve parameter 0-1 (curvature_at_param).'),

    with: faceOrEdgeIdSchema.optional().describe('Other entity for continuity check.'),

    point: point3Schema.optional().describe('3D point for classify/closest_point.'),

    tolerance: z.number().nonnegative().default(0.01).optional().describe('Tolerance mm.'),

    detail_level: z
      .enum(['aggregate', 'summary', 'points'])
      .default('aggregate')
      .optional()
      .describe('aggregate=stats only, summary=+histogram, points=+full coords.'),
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
