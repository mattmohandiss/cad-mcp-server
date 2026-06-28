import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Common primitive schemas                                           */
/* ------------------------------------------------------------------ */

const nonEmpty = z.string().min(1);

export const filePathSchema = nonEmpty.describe(
  'Absolute or relative path to the STEP file on the local filesystem. Paths resolve from the server\'s working directory. For files > 100MB, the call may take several seconds; do not chain with other inspect calls.',
);

const direction3Schema = z
  .array(z.number().finite())
  .length(3)
  .refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, {
    message: 'Direction vector must be non-zero.',
  });

const point3Schema = z.array(z.number().finite()).length(3);

const bodyIdSchema = z
  .string()
  .regex(/^body:\d+$/, 'Body IDs must match body:N.');

const entityIdSchema = z
  .string()
  .min(1)
  .describe('Entity ID. Pattern: "face:N", "edge:N", "vertex:N", or "body:N".');

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const SURFACE_TYPES = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'other'] as const;
export const CURVE_TYPES = ['line', 'circle', 'ellipse', 'bspline', 'other'] as const;
export const VALIDITY_STATUSES = [
  'valid',
  'self_intersecting',
  'invalid_point_on_curve',
  'invalid_point_on_surface',
  'edge_not_in_face',
  'face_orientation',
  'other_invalid',
] as const;
export const PMI_TYPES = ['dimension', 'geometric_tolerance', 'datum', 'annotation'] as const;
export const TOLERANCE_SUBTYPES = [
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
] as const;
export const MATERIAL_CONDITIONS = ['MMC', 'LMC', 'RFS', 'None'] as const;
export const BODY_TYPES = ['solid', 'shell', 'wire', 'face'] as const;
export const COLOR_TYPES = ['surface', 'curve', 'generic'] as const;

export const ENTITIES = [
  'faces',
  'edges',
  'bodies',
  'vertices',
  'pmi',
  'color',
  'layer',
  'material',
  'assembly_node',
] as const;

export const GROUP_BY_DIMENSIONS = [
  'axis',
  'normal_direction',
  'surface_type',
  'curve_type',
  'body_id',
  'material',
  'layer',
  'length_range',
  'area_range',
  'radius_range',
] as const;

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

export const PIPELINE_OPS = [
  'query',
  'for_each',
  'filter_results',
  'select',
  'walk_assembly',
] as const;

export const RETURN_TYPES = ['entities', 'summary', 'groups'] as const;

/* ------------------------------------------------------------------ */
/*  Filter schema (single bag, conditional on entities)               */
/* ------------------------------------------------------------------ */

export const filterSchema = z
  .object({
    /* faces */
    surface_type: z.enum(SURFACE_TYPES).optional().describe(
      'Faces only. Cylinder = holes, bosses, shafts. Plane = planar faces. Bspline = freeform. "other" includes offset, swept, and other analytic surfaces.',
    ),
    area_min: z.number().nonnegative().optional().describe('Faces only. Minimum area in mm^2. Use to filter out chamfers/fillets when analyzing only primary faces.'),
    area_max: z.number().nonnegative().optional().describe('Faces only. Maximum area in mm^2. Use to find small faces (potential artifacts).'),
    normal: z
      .object({
        parallel_to: direction3Schema.describe('Direction vector to match face normals against.'),
        tolerance_degrees: z.number().nonnegative().max(180).default(10).describe('Angle tolerance in degrees. Default 10.'),
      })
      .strict()
      .optional()
      .describe('Faces only. Filter by face normal direction.'),

    /* edges */
    curve_type: z.enum(CURVE_TYPES).optional().describe(
      'Edges only. Circle = fillets, rounds, hole edges. Line = straight edges. Bspline = freeform.',
    ),
    length_min: z.number().nonnegative().optional().describe('Edges only. mm.'),
    length_max: z.number().nonnegative().optional().describe('Edges only. mm. Use to find tiny edges (potential tessellation artifacts or short features under 0.5mm).'),
    curvature_min: z.number().nonnegative().optional().describe('Edges only. 1/mm. Use with curvature_max to find edges within a curvature range (e.g., all fillets with radius 1-3mm => curvature 0.33-1.0).'),
    curvature_max: z.number().nonnegative().optional().describe('Edges only. 1/mm.'),
    has_curve3d: z.boolean().optional().describe('Edges only. True if the edge has a 3D curve representation. Some imported geometry only has 2D pcurves.'),

    /* shared face/edge/bodies */
    radius_min: z.number().nonnegative().optional().describe('Cylindrical faces or circular edges. mm. Use to find holes/fillets above a size threshold.'),
    radius_max: z.number().nonnegative().optional().describe('Cylindrical faces or circular edges. mm.'),
    body_ids: z.array(bodyIdSchema).min(1).optional().describe('Restrict to specific bodies. Required for multi-body models where queries must be scoped.'),
    validity_status: z
      .enum(VALIDITY_STATUSES)
      .optional()
      .describe('Faces, edges, or bodies. "self_intersecting" is the most common issue. Replaces the old boolean is_valid.'),
    tolerance_max: z.number().nonnegative().optional().describe('Faces, edges, or vertices. mm. Tolerance is the precision of the B-rep representation. Values > 0.01mm often indicate lossy imports or STEP round-trips.'),
    canonical_form: z
      .object({
        kind: z.enum(['plane', 'cylinder', 'cone', 'sphere']),
        tolerance: z.number().nonnegative().default(0.01),
      })
      .strict()
      .optional()
      .describe('Faces only. Recognize as a canonical shape (plane/cylinder/cone/sphere) within tolerance.'),

    /* bodies */
    body_type: z.enum(BODY_TYPES).optional().describe('Bodies only.'),
    volume_min: z.number().nonnegative().optional().describe('Bodies only. mm^3.'),
    volume_max: z.number().nonnegative().optional().describe('Bodies only. mm^3.'),

    /* PMI */
    pmi_type: z.enum(PMI_TYPES).optional().describe('PMI only.'),
    tolerance_subtype: z.enum(TOLERANCE_SUBTYPES).optional().describe('PMI only. Geometric tolerance type.'),
    value_min: z.number().nonnegative().optional().describe('PMI only. mm. Minimum tolerance value (for tolerances) or measurement value (for dimensions).'),
    value_max: z.number().nonnegative().optional().describe('PMI only. mm.'),
    material_condition: z.enum(MATERIAL_CONDITIONS).optional().describe('PMI only. Material condition modifier.'),
    linked_to: z
      .object({
        entity_type: z.enum(['face', 'edge', 'vertex', 'body']).optional(),
        surface_type: z.enum(SURFACE_TYPES).optional(),
        curve_type: z.enum(CURVE_TYPES).optional(),
        body_ids: z.array(bodyIdSchema).optional(),
      })
      .strict()
      .optional()
      .describe('PMI only. Filter by the entity the PMI applies to. Supports nested filter on the linked entity.'),

    /* assembly_node */
    node_name: z.string().optional().describe('assembly_node only. Filter by part/component name.'),
    is_instance: z.boolean().optional().describe('assembly_node only. True if the node is an instance (a placement of a part), false if it is a part definition.'),
    is_root: z.boolean().optional().describe('assembly_node only. True if the node is at the top level of the assembly tree.'),

    /* color / layer / material */
    layer_name: z.string().optional().describe('layer only.'),
    rgb: z
      .array(z.number().min(0).max(1))
      .length(3)
      .optional()
      .describe('color only. RGB each component 0-1.'),
    color_type: z.enum(COLOR_TYPES).optional().describe('color only.'),
    material_name: z.string().optional().describe('material only.'),
  })
  .strict();

/* ------------------------------------------------------------------ */
/*  Measure op schema                                                  */
/* ------------------------------------------------------------------ */

export const measureOpSchema = z
  .object({
    op: z.enum(MEASURE_OPS).describe('The measurement operation. Each op has its own additional parameters below.'),
    /* ray */
    direction: direction3Schema.optional().describe('For ray tests and section_by_plane: the direction vector. Default [0,0,1] for Z-up. Does not need to be unit length; will be normalized.'),
    origin: z.union([point3Schema, z.string()]).optional().describe('For ray_test_segment: where to start. "extent_max" = farthest point along the entity\'s extent in the +direction; "extent_min" = nearest. Or a fixed 3D point.'),
    tmax: z.number().positive().optional().describe('For ray_test_segment: maximum ray distance in mm. Default infinity.'),
    spacing_mm: z.number().positive().default(2.0).describe('For ray_test_grid: distance between grid rays in mm. Smaller = more samples, slower. Default 2.0.'),
    /* distance */
    to: entityIdSchema.optional().describe('For distance: target entity ID (e.g., "face:5", "edge:3", "body:0").'),
    /* section */
    plane_origin: point3Schema.optional().describe('For section_by_plane: a point on the cutting plane.'),
    plane_normal: direction3Schema.optional().describe('For section_by_plane: normal of the cutting plane.'),
    /* curvature */
    param: z.number().min(0).max(1).optional().describe('For curvature_at_param: parameter value along the curve (0 to 1, where 0 is the start and 1 is the end).'),
    /* continuity */
    with: entityIdSchema.optional().describe('For continuity: the other face/edge to check continuity with.'),
    /* point ops */
    point: point3Schema.optional().describe('For classify_point / closest_point_on_face: 3D point to classify (x, y, z).'),
    tolerance: z.number().nonnegative().default(0.01).describe('For section_by_plane, canonical_form, and other tolerance-sensitive ops: tolerance in mm. Default 0.01.'),
  })
  .strict();

/* ------------------------------------------------------------------ */
/*  Aggregate spec                                                     */
/* ------------------------------------------------------------------ */

export const aggregateSpec = z
  .string()
  .regex(/^(count|min|max|avg|stddev|sum)(:[a-z_]+)?$/, 'Format: <op>[:<field>]. Examples: "count", "min:area", "max:radius", "avg:hit_distance".')
  .describe('Format: <op>[:<field>]. Ops: count (no field), min, max, avg, stddev, sum. Examples: "count", "min:area", "max:radius", "avg:hit_distance", "stddev:length", "sum:volume".');

/* ------------------------------------------------------------------ */
/*  query_step schema                                                  */
/* ------------------------------------------------------------------ */

export const queryStepInputSchema = {
  file_path: filePathSchema,
  entities: z
    .enum(ENTITIES)
    .describe('Which entity type to query: faces, edges, bodies, vertices, pmi, color, layer, material, assembly_node.'),
  entity_ids: z
    .array(nonEmpty)
    .min(1)
    .max(200)
    .optional()
    .describe('Optional direct lookup. When provided, restricts the query to these specific entity IDs. Use when you already have IDs from a prior query.'),
  filter: filterSchema
    .optional()
    .describe('Filter entities by properties. The filter object accepts all fields; only fields relevant to the chosen entities are applied. Other fields are ignored.'),
  group_by: z
    .array(z.enum(GROUP_BY_DIMENSIONS))
    .min(1)
    .max(3)
    .optional()
    .describe(
      'Cluster entities by a shared property. "axis" groups cylindrical faces by their axis (the operation find_coaxial_cylinders used to do). "normal_direction" groups planar faces by their normal vector. "surface_type" / "curve_type" group by geometry type. "length_range" / "area_range" / "radius_range" group into bucket ranges (0-1, 1-5, 5-25, 25+). Up to 3 dimensions; multiple dimensions form a hierarchy.',
    ),
  measure: z
    .array(measureOpSchema)
    .min(1)
    .max(10)
    .optional()
    .describe('Derived values to compute per entity or per group (ray tests, distances, curvature, section, continuity).'),
  aggregate: z
    .array(aggregateSpec)
    .min(1)
    .max(20)
    .optional()
    .describe('Statistics to compute over the result set. Format: <op>:<field>. Examples: "min:area", "max:radius", "avg:hit_distance", "count:hit_distance". When set, intermediate entities are hidden unless return_intermediate is true.'),
  select: z
    .array(z.string())
    .min(1)
    .max(30)
    .optional()
    .describe('Which fields to include in the response. Defaults vary by entities. Common fields: id, area, length, radius, axis, diameter, extent_along_axis, surface_type, curve_type, normal, bbox, bbox_center, validity_status, tolerance, face_ids, value, datum_refs, linked_to, pos_hits, neg_hits. The LLM can omit this to get defaults.'),
  sort: z
    .object({
      by: z.string().describe('Field to sort by. Must be a field available in the entity type.'),
      direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction. Default asc.'),
    })
    .strict()
    .optional(),
  limit: z.number().int().min(1).max(1000).default(100).describe('Maximum number of entities to return per page. Default 100, max 1000. Use with offset for pagination.'),
  offset: z.number().int().min(0).default(0).describe('Skip this many results before returning. Default 0.'),
  return_type: z.enum(RETURN_TYPES).default('entities').describe('Result shape: "entities" (default) returns paginated entities, "summary" returns statistics only, "groups" returns group counts with sample IDs (requires group_by).'),
};

export const queryStepSchema = z.object(queryStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  inspect_step schema                                                */
/* ------------------------------------------------------------------ */

export const inspectStepInputSchema = {
  file_path: filePathSchema,
};

export const inspectStepSchema = z.object(inspectStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  diff_step schema                                                   */
/* ------------------------------------------------------------------ */

export const diffStepInputSchema = {
  baseline_file_path: nonEmpty.describe('Absolute or relative path to the baseline STEP file.'),
  comparison_file_path: nonEmpty.describe('Absolute or relative path to the comparison STEP file.'),
};

export const diffStepSchema = z.object(diffStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  transact_step schema                                               */
/* ------------------------------------------------------------------ */

export type PipelineStep = {
  op: (typeof PIPELINE_OPS)[number];
  params?: Record<string, unknown>;
  do?: PipelineStep[];
  where?: string;
  fields?: string[];
};

const pipelineStepSchema: z.ZodType<PipelineStep> = z.lazy(() =>
  z
    .object({
      op: z.enum(PIPELINE_OPS).describe('The pipeline operation to execute at this step.'),
      params: z
        .object({})
        .passthrough()
        .optional()
        .describe('For "query": a query_step input shape (entities, filter, group_by, etc.). For "walk_assembly": {per_node: [sub-pipeline]}.'),
      do: z
        .array(pipelineStepSchema)
        .optional()
        .describe('For "for_each": the sub-pipeline to apply to each item.'),
      where: z
        .string()
        .optional()
        .describe('For "filter_results": a simple expression. Format: "field op value" or "field.empty" or "field.count op value". Examples: "diameter > 5", "pos_hits.empty", "face_ids.count == 1".'),
      fields: z
        .array(z.string())
        .min(1)
        .max(30)
        .optional()
        .describe('For "select": the fields to keep in the result.'),
    })
    .strict(),
);

export const transactStepInputSchema = {
  file_path: filePathSchema,
  pipeline: z
    .array(pipelineStepSchema)
    .min(1)
    .max(50)
    .describe('Ordered list of pipeline operations. Each op reads from the previous op\'s output by default. Common ops: query, for_each, filter_results, select, walk_assembly.'),
  return_intermediate: z
    .boolean()
    .default(false)
    .describe('If true, include the result of each step in the response. Default false; set true only for debugging pipelines.'),
};

export const transactStepSchema = z.object(transactStepInputSchema).strict();

/* ------------------------------------------------------------------ */
/*  Schema registry                                                    */
/* ------------------------------------------------------------------ */

export const toolSchemas = {
  inspect_step: inspectStepSchema,
  query_step: queryStepSchema,
  diff_step: diffStepSchema,
  transact_step: transactStepSchema,
} as const;

export const toolInputSchemas = {
  inspect_step: inspectStepInputSchema,
  query_step: queryStepInputSchema,
  diff_step: diffStepInputSchema,
  transact_step: transactStepInputSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;
