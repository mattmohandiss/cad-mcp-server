import { z } from 'zod';
import { compareStepFiles } from '../compare.js';
import { withStepModel } from '../model-store.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import { queryStepEdges as queryEdgesService } from '../query/edges.js';
import { canDirectGetEntities, getStepEntitiesDirect } from '../query/entities.js';
import { queryStepFaces as queryFacesService } from '../query/faces.js';
import { queryStepPmi as queryPmiService } from '../query/pmi.js';
import { wrapTool } from './shared.js';

const filePathInput = {
  file_path: z.string().min(1).describe('Absolute or relative path to the STEP file.'),
};

const direction3Schema = z
  .array(z.number().finite())
  .length(3)
  .refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, {
    message: 'Direction vector must be non-zero.',
  });

const resultModeSchema = z
  .enum(['summary', 'entities', 'groups'])
  .describe(
    'Result shape: "summary" returns statistics only (fastest). "entities" (default) returns paginated entities with projections. "groups" returns group counts with sample IDs (requires group_by).',
  )
  .optional();

const limitSchema = z
  .number()
  .int()
  .positive()
  .max(1000)
  .describe(
    'Maximum number of entities to return per page. Default: 100. Max: 1000. Use with offset for pagination.',
  )
  .optional();

const offsetSchema = z
  .number()
  .int()
  .nonnegative()
  .describe(
    'Skip this many results before returning (for pagination). Default: 0. E.g., offset=100, limit=50 returns results 100-149.',
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
  'axis',
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

function uniqueArray<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

/* ------------------------------------------------------------------ */
/*  Face find schema                                                   */
/* ------------------------------------------------------------------ */

const faceFieldsSchema = z
  .array(z.enum(FACE_FIELDS as unknown as [string, ...string[]]))
  .min(1)
  .max(12)
  .refine(uniqueArray, 'Field values must be unique.')
  .describe('Face fields to include. Default: id,surface_type,area,bbox,bbox_center.')
  .optional();

const faceGroupBySchema = z
  .array(z.enum(['surface_type', 'normal_direction', 'area_range', 'radius', 'body_id']))
  .min(1)
  .max(5)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe('List of dimensions to group faces by. E.g., ["surface_type"] groups by geometry type.')
  .optional();

const faceSortSchema = z
  .object({
    by: z.enum(['area', 'surface_type', 'center_x', 'center_y', 'center_z']),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .optional();

const findStepFacesSchema = {
  ...filePathInput,
  surface_types: z
    .array(z.enum(['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'other']))
    .min(1)
    .max(7)
    .refine(uniqueArray, 'Surface type values must be unique.')
    .describe('Surface geometry types to match. Omit to include all types.')
    .optional(),
  area_min: z.number().nonnegative().describe('Minimum face area in mm^2.').optional(),
  area_max: z.number().nonnegative().describe('Maximum face area in mm^2.').optional(),
  normal: z
    .object({
      parallel_to: direction3Schema.describe(
        'Direction vector [x, y, z] to match face normals against.',
      ),
      tolerance_degrees: z
        .number()
        .nonnegative()
        .max(180)
        .describe('Angle tolerance in degrees (default: 10).')
        .optional(),
    })
    .strict()
    .describe('Filter by face normal direction.')
    .optional(),
  body_ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine(uniqueArray, 'Body IDs must be unique.')
    .describe('Restrict to specific bodies in multi-body models. Omit to search all bodies.')
    .optional(),
  fields: faceFieldsSchema,
  group_by: faceGroupBySchema,
  sort: faceSortSchema,
  return_type: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

/* ------------------------------------------------------------------ */
/*  Edge find schema                                                   */
/* ------------------------------------------------------------------ */

const edgeFieldsSchema = z
  .array(z.enum(EDGE_FIELDS as unknown as [string, ...string[]]))
  .min(1)
  .max(10)
  .refine(uniqueArray, 'Field values must be unique.')
  .describe('Edge fields to include. Default: id,curve_type,length,bbox,bbox_center.')
  .optional();

const edgeGroupBySchema = z
  .array(z.enum(['curve_type', 'length_range', 'body_id']))
  .min(1)
  .max(3)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe('List of dimensions to group edges by. E.g., ["curve_type","length_range"].')
  .optional();

const edgeSortSchema = z
  .object({
    by: z.enum(['length', 'curve_type', 'radius', 'center_x', 'center_y', 'center_z']),
    direction: z
      .enum(['asc', 'desc'])
      .describe('"asc" (ascending, default) or "desc" (descending)')
      .optional(),
  })
  .strict()
  .optional();

const edgeRadiusSchema = z
  .object({
    min: z.number().nonnegative().describe('Minimum radius in mm.').optional(),
    max: z.number().nonnegative().describe('Maximum radius in mm.').optional(),
  })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: 'radius.min must be <= radius.max.',
  })
  .describe('Filter circular/curved edges by radius.')
  .optional();

const findStepEdgesSchema = {
  ...filePathInput,
  curve_types: z
    .array(z.enum(['line', 'circle', 'ellipse', 'bspline', 'other']))
    .min(1)
    .max(5)
    .refine(uniqueArray, 'Curve type values must be unique.')
    .describe('Edge curve types to match. Omit to include all types.')
    .optional(),
  length_min: z.number().nonnegative().describe('Minimum edge length in mm.').optional(),
  length_max: z.number().nonnegative().describe('Maximum edge length in mm.').optional(),
  radius: edgeRadiusSchema,
  body_ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine(uniqueArray, 'Body IDs must be unique.')
    .describe('Restrict to specific bodies in multi-body models.')
    .optional(),
  fields: edgeFieldsSchema,
  group_by: edgeGroupBySchema,
  sort: edgeSortSchema,
  return_type: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

/* ------------------------------------------------------------------ */
/*  Get entities schema                                                */
/* ------------------------------------------------------------------ */

const getStepEntitiesSchema = {
  ...filePathInput,
  entity_type: z.enum(['face', 'edge']).describe('Entity kind to retrieve.'),
  entity_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(200)
    .refine(uniqueArray, 'Entity IDs must be unique.')
    .describe('Exact entity IDs. Must be face:N or edge:N.'),
  fields: z
    .array(
      z.enum([
        ...FACE_FIELDS,
        ...EDGE_FIELDS.filter((f) => !FACE_FIELDS.includes(f as never)),
      ] as unknown as [string, ...string[]]),
    )
    .min(1)
    .max(16)
    .refine(uniqueArray, 'Field values must be unique.')
    .describe('Entity fields to include.')
    .optional(),
};

/* ------------------------------------------------------------------ */
/*  Compare schema                                                     */
/* ------------------------------------------------------------------ */

const compareStepFilesSchema = {
  baseline_file_path: z
    .string()
    .min(1)
    .describe('Absolute or relative path to the baseline STEP file.'),
  comparison_file_path: z
    .string()
    .min(1)
    .describe('Absolute or relative path to the comparison STEP file.'),
};

/* ------------------------------------------------------------------ */
/*  PMI query schema                                                   */
/* ------------------------------------------------------------------ */

const pmiGroupBySchema = z
  .array(z.enum(['type', 'tolerance_type', 'dimension_type', 'material_condition']))
  .min(1)
  .max(3)
  .refine(uniqueArray, 'Group-by values must be unique.')
  .describe('List of dimensions to group PMI entities by.')
  .optional();

const pmiSortSchema = z
  .object({
    by: z.enum(['type', 'value', 'tolerance_type']),
    direction: z.enum(['asc', 'desc']).optional(),
  })
  .strict()
  .optional();

const pmiQuerySchema = {
  ...filePathInput,
  pmi_types: z
    .array(z.enum(['geometric_tolerance', 'dimension', 'datum', 'annotation']))
    .min(1)
    .max(5)
    .refine(uniqueArray, 'PMI type values must be unique.')
    .describe('PMI categories to filter by.')
    .optional(),
  tolerance_subtypes: z
    .array(
      z.enum([
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
      ]),
    )
    .min(1)
    .max(17)
    .refine(uniqueArray, 'Tolerance subtype values must be unique.')
    .describe('Geometric tolerance subtypes to filter by.')
    .optional(),
  value_min: z
    .number()
    .nonnegative()
    .describe('Minimum tolerance/dimension value in mm.')
    .optional(),
  value_max: z
    .number()
    .nonnegative()
    .describe('Maximum tolerance/dimension value in mm.')
    .optional(),
  group_by: pmiGroupBySchema,
  sort: pmiSortSchema,
  return_type: resultModeSchema,
  limit: limitSchema,
  offset: offsetSchema,
};

/* ------------------------------------------------------------------ */
/*  Public exports                                                     */
/* ------------------------------------------------------------------ */

export const stepToolSchemas = {
  inspectStepFile: filePathInput,
  findStepFaces: findStepFacesSchema,
  findStepEdges: findStepEdgesSchema,
  getStepEntities: getStepEntitiesSchema,
  compareStepFiles: compareStepFilesSchema,
  queryStepPmi: pmiQuerySchema,
} as const;

/* ------------------------------------------------------------------ */
/*  Output schemas                                                     */
/* ------------------------------------------------------------------ */

const schemaVersionField = { schema_version: z.literal(CAD_RESPONSE_SCHEMA_VERSION) };

const queryOutputSchema = z
  .object({
    ...schemaVersionField,
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
    warnings: z.array(z.union([z.string(), z.object({}).passthrough()])),
    limitations: z.array(z.union([z.string(), z.object({}).passthrough()])),
  })
  .passthrough();

const compareOutputSchema = z
  .object({
    ...schemaVersionField,
    files: z.object({ a: z.string(), b: z.string() }),
    deltas: z.object({}).passthrough(),
    exchange: z.object({}).passthrough(),
    warnings: z.array(z.object({}).passthrough()),
    limitations: z.array(z.object({}).passthrough()),
    providers: z.object({}).passthrough(),
  })
  .passthrough();

export const stepToolOutputSchemas = {
  inspectStepFile: z.object({
    ...schemaVersionField,
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
  }),
  findStepFaces: queryOutputSchema,
  findStepEdges: queryOutputSchema,
  getStepEntities: queryOutputSchema,
  compareStepFiles: compareOutputSchema,
  queryStepPmi: queryOutputSchema,
} as const;

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

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
          faces: { total: brep.faceCount },
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
  query: Record<string, unknown> | undefined,
) {
  return wrapTool(async () => queryFacesService(filePath, (query ?? {}) as never));
}

export async function handleFindStepEdges(
  filePath: string,
  query: Record<string, unknown> | undefined,
) {
  return wrapTool(async () => queryEdgesService(filePath, (query ?? {}) as never));
}

export async function handleGetStepEntities(
  filePath: string,
  query: Record<string, unknown> | undefined,
) {
  return wrapTool(async () => {
    const q = query as Partial<PublicGetStepEntitiesInput> | undefined;
    if (!q?.entity_type) throw invalidInput('entity_type is required.');
    if (!q.entity_ids || q.entity_ids.length === 0) {
      throw invalidInput('entity_ids is required and must contain at least one ID.');
    }

    if (q.entity_type === 'face') {
      validateEntityIds(q.entity_ids, 'face');
      validateEntityFields(q.fields, 'face');
      if (canDirectGetEntities(q as never)) {
        return getStepEntitiesDirect(filePath, q as never);
      }
      return queryFacesService(filePath, {
        entity_ids: q.entity_ids,
        fields: q.fields,
        return_type: 'entities',
        limit: q.entity_ids.length,
        offset: 0,
      } as never);
    }

    validateEntityIds(q.entity_ids, 'edge');
    validateEntityFields(q.fields, 'edge');
    if (canDirectGetEntities(q as never)) {
      return getStepEntitiesDirect(filePath, q as never);
    }
    return queryEdgesService(filePath, {
      entity_ids: q.entity_ids,
      fields: q.fields,
      return_type: 'entities',
      limit: q.entity_ids.length,
      offset: 0,
    } as never);
  });
}

export async function handleCompareStepFiles(fileA: string, fileB: string) {
  return wrapTool(async () => compareStepFiles(fileA, fileB));
}

export async function handleQueryStepPmi(
  filePath: string,
  query: Record<string, unknown> | undefined,
) {
  return wrapTool(async () => {
    const q = query ?? {};
    if (
      q.value_min !== undefined &&
      q.value_max !== undefined &&
      (q.value_min as number) > (q.value_max as number)
    ) {
      throw invalidInput('value_min must be less than or equal to value_max.');
    }
    return queryPmiService(filePath, q as never);
  });
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

export type PublicGetStepEntitiesInput = {
  entity_type: 'face' | 'edge';
  entity_ids: string[];
  fields?: string[];
};

function validateEntityIds(entityIds: string[], entityType: 'face' | 'edge'): void {
  const valid = entityIds.every((id) =>
    entityType === 'face' ? /^face:\d+$/.test(id) : /^edge:\d+$/.test(id),
  );
  if (!valid) throw invalidInput(`All entity_ids must match ${entityType}:N.`);
}

function validateEntityFields(fields: string[] | undefined, entityType: 'face' | 'edge'): void {
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

/* ------------------------------------------------------------------ */
/*  Response types (exported for consumers)                            */
/* ------------------------------------------------------------------ */

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
