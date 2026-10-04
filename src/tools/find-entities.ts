import { z } from 'zod';
import { runTool } from '../tool-helper.js';
import { sidecarModels } from '../sidecar/models.js';
import { filePath } from '../tool-schemas.js';
import { CURVE_TYPES, SURFACE_TYPES } from '../tool-defs.js';
import { parseEntityId } from '../utils/ids.js';

const page = {
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
};
const faceId = z.string().refine((id) => parseEntityId(id)?.type === 'face');
const edgeId = z.string().refine((id) => parseEntityId(id)?.type === 'edge');
const vertexId = z.string().refine((id) => parseEntityId(id)?.type === 'vertex');
const bodyId = z.string().refine((id) => parseEntityId(id)?.type === 'body');

export const schema = z.discriminatedUnion('entity_type', [
  z
    .object({
      file_path: filePath,
      entity_type: z.literal('face'),
      component_name: z.string().min(1).max(256).optional().meta({
        description:
          'Optional component scope from inspect.structure.component_occurrences; use the base name for all repeated instances or the full name#instance ID for one occurrence.',
      }),
      entity_ids: z.array(faceId).min(1).max(1000).optional(),
      surface_type: z.enum(SURFACE_TYPES).optional(),
      min_area: z.number().nonnegative().optional(),
      max_area: z.number().nonnegative().optional(),
      min_radius: z.number().nonnegative().optional(),
      max_radius: z.number().nonnegative().optional(),
      ...page,
    })
    .strict()
    .superRefine((args, ctx) => {
      if (
        args.min_area !== undefined &&
        args.max_area !== undefined &&
        args.min_area > args.max_area
      )
        ctx.addIssue({
          code: 'custom',
          path: ['max_area'],
          message: 'max_area must be >= min_area.',
        });
      if (
        args.min_radius !== undefined &&
        args.max_radius !== undefined &&
        args.min_radius > args.max_radius
      )
        ctx.addIssue({
          code: 'custom',
          path: ['max_radius'],
          message: 'max_radius must be >= min_radius.',
        });
    }),
  z
    .object({
      file_path: filePath,
      entity_type: z.literal('edge'),
      component_name: z.string().min(1).max(256).optional().meta({
        description:
          'Optional component scope from inspect.structure.component_occurrences; use the base name for all repeated instances or the full name#instance ID for one occurrence.',
      }),
      entity_ids: z.array(edgeId).min(1).max(1000).optional(),
      curve_type: z.enum(CURVE_TYPES).optional(),
      min_length: z.number().nonnegative().optional(),
      max_length: z.number().nonnegative().optional(),
      min_radius: z.number().nonnegative().optional(),
      max_radius: z.number().nonnegative().optional(),
      ...page,
    })
    .strict()
    .superRefine((args, ctx) => {
      if (
        args.min_length !== undefined &&
        args.max_length !== undefined &&
        args.min_length > args.max_length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['max_length'],
          message: 'max_length must be >= min_length.',
        });
      if (
        args.min_radius !== undefined &&
        args.max_radius !== undefined &&
        args.min_radius > args.max_radius
      )
        ctx.addIssue({
          code: 'custom',
          path: ['max_radius'],
          message: 'max_radius must be >= min_radius.',
        });
    }),
  z
    .object({
      file_path: filePath,
      entity_type: z.literal('vertex'),
      component_name: z.string().min(1).max(256).optional().meta({
        description:
          'Optional component scope from inspect.structure.component_occurrences; use the base name for all repeated instances or the full name#instance ID for one occurrence.',
      }),
      entity_ids: z.array(vertexId).min(1).max(1000).optional(),
      ...page,
    })
    .strict(),
  z
    .object({
      file_path: filePath,
      entity_type: z.literal('body'),
      component_name: z.string().min(1).max(256).optional().meta({
        description:
          'Optional component scope from inspect.structure.component_occurrences; use the base name for all repeated instances or the full name#instance ID for one occurrence.',
      }),
      entity_ids: z.array(bodyId).min(1).max(1000).optional(),
      ...page,
    })
    .strict(),
]);

export const examples = [
  { file_path: 'model.step', entity_type: 'face', surface_type: 'cylinder', min_area: 100 },
  { file_path: 'model.step', entity_type: 'edge', curve_type: 'circle', min_length: 20 },
  { file_path: 'model.step', entity_type: 'vertex', limit: 20 },
  { file_path: 'model.step', entity_type: 'body' },
];

export async function handler(args: z.output<typeof schema>) {
  return runTool(() =>
    sidecarModels.withModel(args.file_path, async (client, modelId, filePath) => {
      const filters =
        args.entity_type === 'face'
          ? {
              surface_type: args.surface_type,
              min_area: args.min_area,
              max_area: args.max_area,
              min_radius: args.min_radius,
              max_radius: args.max_radius,
            }
          : args.entity_type === 'edge'
            ? {
                curve_type: args.curve_type,
                min_length: args.min_length,
                max_length: args.max_length,
                min_radius: args.min_radius,
                max_radius: args.max_radius,
              }
            : {};
      const { result } = await client.request<{
        entities: Array<Record<string, unknown>>;
        total_matched: number;
      }>('findEntities', {
        modelId,
        entityType: args.entity_type,
        componentName: args.component_name,
        entityIds: args.entity_ids,
        filters,
        limit: args.limit,
        offset: args.offset,
      });
      const { file_path: _file, entity_type, entity_ids, limit, offset, ...where } = args;
      const compactFilters = Object.fromEntries(
        Object.entries(where).filter(
          ([key, value]) => !['limit', 'offset'].includes(key) && value !== undefined,
        ),
      );
      return {
        file_path: filePath,
        units: { length: 'mm', area: 'mm^2', volume: 'mm^3', angle: 'deg' },
        coordinate_system: {
          origin: 'STEP model origin',
          axes: 'model coordinates',
          handedness: 'right',
        },
        query: { entity_type, filters: compactFilters, ...(entity_ids ? { entity_ids } : {}) },
        statistics: { total_entities: result.total_matched },
        pagination: {
          limit,
          offset,
          returned: result.entities.length,
          total_matched: result.total_matched,
          has_more: offset + result.entities.length < result.total_matched,
        },
        entities: result.entities,
        groups: [],
        model_reference: { source: filePath, revision: 'current', units: 'mm' },
      };
    }),
  );
}
