import { z } from 'zod';
import { runTool } from '../tool-helper.js';
import { sidecarModels } from '../sidecar/models.js';
import { directionModeSchema, entityId, filePath, point3, shapeEntityId } from '../tool-schemas.js';
import { parseEntityId } from '../utils/ids.js';

export const MEASURE_KINDS = [
  'distance',
  'thickness',
  'draft',
  'ray',
  'ray_grid',
  'point_analysis',
  'section',
  'continuity',
] as const;

export const schema = z
  .object({
    file_path: filePath,
    kind: z.enum(MEASURE_KINDS),
    sources: z.array(shapeEntityId).min(1).max(1000).optional(),
    targets: z.array(shapeEntityId).min(1).max(1000).optional(),
    summary: z.enum(['all', 'minimum']).default('all').optional(),
    entity_ids: z.array(entityId).min(1).max(100).optional(),
    direction: point3.optional(),
    direction_mode: directionModeSchema.optional(),
    pull_direction: point3.optional(),
    pull_direction_mode: directionModeSchema.optional(),
    bidirectional: z.boolean().optional(),
    spacing_mm: z.number().positive().max(1000).optional(),
    max_distance: z.number().positive().max(1_000_000).optional(),
    origin: point3.optional(),
    origin_mode: z.enum(['extent_min', 'extent_center', 'extent_max']).optional(),
    points: z.array(point3).min(1).max(100).optional(),
    checks: z
      .array(
        z.enum([
          'contains_body',
          'classify_face',
          'closest_face_point',
          'surface_curvature',
          'edge_projection',
        ]),
      )
      .min(1)
      .max(5)
      .optional(),
    tolerance: z.number().nonnegative().max(1000).optional(),
    plane_origin: point3.optional(),
    plane_normal: point3.optional(),
    detail: z.enum(['stats', 'samples', 'hits']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.direction && value.direction_mode)
      ctx.addIssue({
        code: 'custom',
        path: ['direction_mode'],
        message: 'Choose direction or direction_mode, not both.',
      });
    if (value.origin && value.origin_mode)
      ctx.addIssue({
        code: 'custom',
        path: ['origin_mode'],
        message: 'Choose origin or origin_mode, not both.',
      });
    if (value.pull_direction && value.pull_direction_mode)
      ctx.addIssue({
        code: 'custom',
        path: ['pull_direction_mode'],
        message: 'Choose pull_direction or pull_direction_mode, not both.',
      });
    if (value.kind === 'distance') {
      if (!value.sources || !value.targets)
        ctx.addIssue({
          code: 'custom',
          path: ['sources'],
          message: 'distance requires sources and targets.',
        });
      if (value.entity_ids)
        ctx.addIssue({
          code: 'custom',
          path: ['entity_ids'],
          message: 'distance uses sources and targets.',
        });
      if (value.sources && value.targets && value.sources.length * value.targets.length > 100_000)
        ctx.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'At most 100,000 entity pairs are allowed.',
        });
    } else {
      const entityKinds = (value.entity_ids ?? []).map((id) => parseEntityId(id)?.type);
      if (!value.entity_ids)
        ctx.addIssue({
          code: 'custom',
          path: ['entity_ids'],
          message: `${value.kind} requires entity_ids.`,
        });
      if (
        ['thickness', 'draft', 'ray_grid'].includes(value.kind) &&
        entityKinds.some((kind) => kind !== 'face')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['entity_ids'],
          message: `${value.kind} accepts face IDs only.`,
        });
      if (
        (value.direction_mode || value.pull_direction_mode) &&
        entityKinds.some((kind) => kind !== 'face')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['direction_mode'],
          message: 'Direction shortcuts currently require face IDs.',
        });
      if (value.kind === 'continuity' && entityKinds.some((kind) => kind !== 'edge'))
        ctx.addIssue({
          code: 'custom',
          path: ['entity_ids'],
          message: 'continuity accepts edge IDs only.',
        });
      if (value.sources || value.targets)
        ctx.addIssue({
          code: 'custom',
          path: ['sources'],
          message: `${value.kind} does not accept distance sets.`,
        });
      if (value.kind === 'draft' && !value.pull_direction && !value.pull_direction_mode)
        ctx.addIssue({
          code: 'custom',
          path: ['pull_direction'],
          message: 'draft requires a pull direction.',
        });
      if (
        (value.kind === 'ray' || value.kind === 'ray_grid') &&
        !value.direction &&
        !value.direction_mode
      )
        ctx.addIssue({
          code: 'custom',
          path: ['direction'],
          message: `${value.kind} requires a direction.`,
        });
      if (value.kind === 'point_analysis') {
        if (!value.points)
          ctx.addIssue({
            code: 'custom',
            path: ['points'],
            message: 'point_analysis requires points.',
          });
        if (!value.checks)
          ctx.addIssue({
            code: 'custom',
            path: ['checks'],
            message: 'point_analysis requires checks.',
          });
        if (
          value.entity_ids &&
          value.points &&
          value.checks &&
          value.entity_ids.length * value.points.length * value.checks.length > 5000
        )
          ctx.addIssue({
            code: 'custom',
            path: ['points'],
            message:
              'Point-analysis requests are limited to 5,000 entity-point-check combinations.',
          });
      }
      if (value.kind === 'section') {
        if (!value.plane_origin)
          ctx.addIssue({
            code: 'custom',
            path: ['plane_origin'],
            message: 'section requires plane_origin.',
          });
        if (!value.plane_normal)
          ctx.addIssue({
            code: 'custom',
            path: ['plane_normal'],
            message: 'section requires plane_normal.',
          });
      }
    }
  });

export const examples = [
  {
    file_path: 'model.step',
    kind: 'distance',
    sources: ['face:2'],
    targets: ['face:5'],
    summary: 'minimum',
  },
  { file_path: 'model.step', kind: 'thickness', entity_ids: ['face:6'], direction_mode: 'normal' },
  { file_path: 'model.step', kind: 'draft', entity_ids: ['face:1'], pull_direction: [0, 0, 1] },
  {
    file_path: 'model.step',
    kind: 'ray_grid',
    entity_ids: ['face:6'],
    direction_mode: 'normal',
    spacing_mm: 2,
  },
  {
    file_path: 'model.step',
    kind: 'section',
    entity_ids: ['body:0'],
    plane_origin: [0, 0, 0],
    plane_normal: [1, 0, 0],
  },
];

export async function handler(args: z.output<typeof schema>) {
  return runTool(() =>
    sidecarModels.withModel(args.file_path, async (client, modelId, filePath) => {
      if (args.kind === 'distance') {
        const { result } = await client.request<{
          pair_count: number;
          pairs: Array<{ source_entity_id: string; target_entity_id: string; distance: number }>;
          minimum: { source_entity_id: string; target_entity_id: string; distance: number } | null;
        }>('measureEntityDistances', {
          modelId,
          sources: args.sources,
          targets: args.targets,
          summary: args.summary,
        });
        return {
          file_path: filePath,
          kind: args.kind,
          units: { length: 'mm' },
          pair_count: result.pair_count,
          min_distance: result.minimum?.distance,
          closest_source: result.minimum?.source_entity_id,
          closest_target: result.minimum?.target_entity_id,
          pairs: result.pairs,
        };
      }
      const { result } = await client.request<{ results: Array<Record<string, unknown>> }>(
        'measureGeometry',
        {
          modelId,
          kind: args.kind,
          entityIds: args.entity_ids,
          direction: args.kind === 'draft' ? args.pull_direction : args.direction,
          directionMode:
            args.kind === 'draft'
              ? args.pull_direction_mode
              : args.kind === 'thickness' && args.direction_mode === 'normal'
                ? 'inward_normal'
                : args.direction_mode,
          origin: args.origin,
          originMode: args.origin_mode,
          bidirectional: args.bidirectional,
          spacingMm: args.spacing_mm,
          maxDistance: args.max_distance,
          points: args.points,
          checks: args.checks,
          tolerance: args.tolerance,
          planeOrigin: args.plane_origin,
          planeNormal: args.plane_normal,
          detail: args.detail,
        },
      );
      return {
        file_path: filePath,
        kind: args.kind,
        units: { length: 'mm', angle: 'deg', curvature: '1/mm' },
        entity_count: args.entity_ids?.length ?? 0,
        results: result.results,
      };
    }),
  );
}
