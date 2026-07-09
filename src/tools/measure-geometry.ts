import { z } from 'zod';
import type { MeasureSpec } from '../query/measure.js';
import { runTool } from '../tool-helper.js';
import { MEASUREMENT_TYPES } from '../tool-defs.js';
import {
  filePath,
  shapeEntityId,
  entityIdArray,
  point3,
  directionModeSchema,
  exclusiveFields,
} from '../tool-schemas.js';
import { batchMeasure, mapDirectionMode } from './measure-helpers.js';

export const schema = z
  .object({
    file_path: filePath,
    measurement_type: z.enum(MEASUREMENT_TYPES).meta({
      description:
        'ray = single ray from origin in direction; ray_grid = grid of rays across entity; point_analysis = classify/project/curvature at points; section = planar cross-section; continuity = edge smoothness between adjacent faces.',
    }),
    entity_ids: entityIdArray(
      shapeEntityId,
      'Entity IDs from find_faces/find_edges or inspect_step bodies.',
    ),
    direction: point3
      .optional()
      .meta({ description: 'Ray direction [x,y,z]. Used by ray, ray_grid.' }),
    direction_mode: directionModeSchema.optional(),
    origin: point3.optional().meta({
      description: 'Ray origin [x,y,z]. Used by ray. Mutually exclusive with origin_mode.',
    }),
    origin_mode: z
      .enum(['extent_min', 'extent_center', 'extent_max'])
      .optional()
      .meta({ description: 'Origin shortcut relative to entity bounding box. Used by ray.' }),
    max_distance: z.number().positive().optional().meta({
      description: 'Maximum ray distance mm. If set, ray becomes bounded (ray_test_segment).',
    }),
    bidirectional: z
      .boolean()
      .optional()
      .meta({ description: 'Fire rays in both directions. Used by ray_grid.' }),
    spacing_mm: z
      .number()
      .positive()
      .optional()
      .meta({ description: 'Grid spacing mm. Used by ray_grid. Default 2.' }),
    detail: z.enum(['stats', 'samples', 'hits']).optional().meta({
      description: 'stats = min/max/avg; samples = hit coordinates; hits = full grid results.',
    }),
    points: z
      .array(point3)
      .min(1)
      .optional()
      .meta({ description: '3D points to analyze. Required for point_analysis.' }),
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
      .optional()
      .meta({ description: 'Checks to perform at each point. Required for point_analysis.' }),
    tolerance: z
      .number()
      .nonnegative()
      .optional()
      .meta({ description: 'Tolerance mm for point checks. Default 0.01.' }),
    plane_origin: point3
      .optional()
      .meta({ description: 'Point on cutting plane. Required for section.' }),
    plane_normal: point3
      .optional()
      .meta({ description: 'Normal of cutting plane. Required for section.' }),
  })
  .strict()
  .superRefine((value, ctx) => {
    exclusiveFields('direction', 'direction_mode')(value, ctx);
    exclusiveFields('origin', 'origin_mode')(value, ctx);
    switch (value.measurement_type) {
      case 'ray':
        if (value.direction === undefined && value.direction_mode === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['direction'],
            message: 'direction or direction_mode is required for ray',
          });
        }
        break;
      case 'ray_grid':
        if (value.direction === undefined && value.direction_mode === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['direction'],
            message: 'direction or direction_mode is required for ray_grid',
          });
        }
        break;
      case 'point_analysis':
        if (value.points === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['points'],
            message: 'points is required for point_analysis',
          });
        }
        if (value.checks === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['checks'],
            message: 'checks is required for point_analysis',
          });
        }
        break;
      case 'section':
        if (value.plane_origin === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['plane_origin'],
            message: 'plane_origin is required for section',
          });
        }
        if (value.plane_normal === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['plane_normal'],
            message: 'plane_normal is required for section',
          });
        }
        break;
      case 'continuity':
        break;
    }
  });

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    measurement_type: 'ray',
    entity_ids: ['face:7'],
    direction: [0, 0, 1],
    origin_mode: 'extent_center',
    max_distance: 50,
  },
  {
    file_path: 'model.step',
    measurement_type: 'ray_grid',
    entity_ids: ['face:6'],
    direction_mode: 'normal',
    spacing_mm: 2,
  },
  {
    file_path: 'model.step',
    measurement_type: 'point_analysis',
    entity_ids: ['face:3'],
    points: [[10, 5, 0]],
    checks: ['closest_face_point', 'surface_curvature'],
  },
  {
    file_path: 'model.step',
    measurement_type: 'section',
    entity_ids: ['body:0'],
    plane_origin: [0, 0, 0],
    plane_normal: [1, 0, 0],
  },
  {
    file_path: 'model.step',
    measurement_type: 'continuity',
    entity_ids: ['edge:5'],
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    const specs = buildMeasureSpecs(args);
    const results = await batchMeasure(args.file_path, args.entity_ids, specs);
    return {
      file_path: args.file_path,
      measurement_type: args.measurement_type,
      entity_count: args.entity_ids.length,
      results,
    };
  });
}

export function buildMeasureSpecs(args: Args): MeasureSpec[] {
  const mode = mapDirectionMode(args.direction_mode);
  const direction = args.direction;

  switch (args.measurement_type) {
    case 'ray':
      return [
        {
          op: args.max_distance !== undefined ? 'ray_test_segment' : 'ray_test',
          origin: args.origin ?? args.origin_mode,
          direction_shortcut: mode,
          direction,
          tmax: args.max_distance,
        },
      ];
    case 'ray_grid':
      return [
        {
          op: 'ray_test_grid',
          direction_shortcut: mode,
          direction,
          bidirectional: args.bidirectional === true,
          spacing_mm: args.spacing_mm,
          detail_level:
            args.detail === 'samples' ? 'points' : args.detail === 'hits' ? 'points' : 'aggregate',
        },
      ];
    case 'point_analysis':
      return args.points!.flatMap((point) =>
        args.checks!.map((check): MeasureSpec => {
          const op =
            check === 'contains_body'
              ? 'contains_point'
              : check === 'classify_face'
                ? 'classify_point'
                : check === 'closest_face_point'
                  ? 'closest_point_on_face'
                  : check === 'surface_curvature'
                    ? 'surface_curvature'
                    : 'edge_projection';
          return { op, point, tolerance: args.tolerance };
        }),
      );
    case 'section':
      return [
        {
          op: 'section_by_plane',
          plane_origin: args.plane_origin,
          plane_normal: args.plane_normal,
        },
      ];
    case 'continuity':
      return [{ op: 'continuity' }];
  }
}
