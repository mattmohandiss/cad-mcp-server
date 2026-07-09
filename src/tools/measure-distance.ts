import { z } from 'zod';
import type { ShapeHandle } from 'occt-wasm';
import { withStepModel } from '../model-store.js';
import { runTool } from '../tool-helper.js';
import { filePath, shapeEntityId, entityIdArray } from '../tool-schemas.js';
import { resolveEntityShape } from './measure-helpers.js';

export const schema = z
  .object({
    file_path: filePath,
    sources: entityIdArray(
      shapeEntityId,
      'Source entity IDs for set-based distance. Use with targets for clearance checks.',
    ).optional(),
    targets: entityIdArray(shapeEntityId, 'Target entity IDs for set-based distance.').optional(),
    target_entity_id: shapeEntityId.optional().meta({
      description: 'Single target entity ID. Use when sources is omitted with entity_ids.',
    }),
    entity_ids: entityIdArray(
      shapeEntityId,
      'Source entity IDs (legacy mode with target_entity_id). Prefer sources/targets for set mode.',
    ).optional(),
    summary: z
      .enum(['all', 'minimum'])
      .default('all')
      .optional()
      .meta({ description: 'all = return every pair; minimum = return only the closest pair.' }),
    include_extrema: z
      .boolean()
      .default(false)
      .optional()
      .meta({ description: 'Include closest point pairs with coordinates.' }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sources !== undefined || value.targets !== undefined) {
      if (value.sources === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources'],
          message: 'sources is required with targets',
        });
      }
      if (value.targets === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'targets is required with sources',
        });
      }
    } else if (value.target_entity_id === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_entity_id'],
        message: 'Provide sources+targets or entity_ids+target_entity_id',
      });
    }
  });

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    sources: ['face:2', 'face:3', 'face:4'],
    targets: ['face:0', 'face:5', 'face:6', 'face:8'],
    summary: 'minimum',
  },
  {
    file_path: 'model.step',
    entity_ids: ['face:6', 'face:7'],
    target_entity_id: 'edge:0',
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    if (args.sources && args.targets) {
      return measureDistanceSets(
        args.file_path,
        args.sources,
        args.targets,
        args.summary ?? 'all',
        args.include_extrema ?? false,
      );
    }

    return measureDistanceLegacy(
      args.file_path,
      args.entity_ids ?? [],
      args.target_entity_id!,
      args.include_extrema ?? false,
    );
  });
}

interface DistancePairResult {
  source_entity_id: string;
  target_entity_id: string;
  distance: number;
  extrema?: {
    pair_count: number;
    min_distance?: number;
    max_distance?: number;
    pairs: Array<{
      distance: number;
      point_on_source: [number, number, number];
      point_on_target: [number, number, number];
    }>;
  };
}

async function measureDistanceSets(
  filePath: string,
  sources: string[],
  targets: string[],
  summary: string,
  includeExtrema: boolean,
) {
  return withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('measure_geometry');
    const wantAllPairs = summary !== 'minimum';
    const pairs: DistancePairResult[] = wantAllPairs ? [] : [];
    let minimum: DistancePairResult | undefined;
    let pairCount = 0;

    const shapeCache = new Map<string, ShapeHandle | undefined>();

    for (const sourceId of sources) {
      let sourceShape = shapeCache.get(sourceId);
      if (sourceShape === undefined && !shapeCache.has(sourceId)) {
        sourceShape = resolveEntityShape(kernel, shape, sourceId);
        shapeCache.set(sourceId, sourceShape);
      }
      if (!sourceShape) continue;

      for (const targetId of targets) {
        let targetShape = shapeCache.get(targetId);
        if (targetShape === undefined && !shapeCache.has(targetId)) {
          targetShape = resolveEntityShape(kernel, shape, targetId);
          shapeCache.set(targetId, targetShape);
        }
        if (!targetShape) continue;

        pairCount++;
        const distance = kernel.distanceBetween(sourceShape, targetShape);

        if (wantAllPairs || includeExtrema) {
          const pair: DistancePairResult = {
            source_entity_id: sourceId,
            target_entity_id: targetId,
            distance,
          };
          if (includeExtrema) {
            pair.extrema = buildExtrema(kernel, sourceShape, targetShape);
          }
          if (wantAllPairs) pairs.push(pair);
        }

        if (minimum === undefined || distance < minimum.distance) {
          minimum = { source_entity_id: sourceId, target_entity_id: targetId, distance };
        }
      }
    }

    return {
      file_path: filePath,
      sources,
      targets,
      pair_count: pairCount,
      summary: minimum
        ? {
            min_distance: minimum.distance,
            source_entity_id: minimum.source_entity_id,
            target_entity_id: minimum.target_entity_id,
          }
        : undefined,
      pairs: wantAllPairs ? pairs : undefined,
    };
  });
}

async function measureDistanceLegacy(
  filePath: string,
  entityIds: string[],
  targetEntityId: string,
  includeExtrema: boolean,
) {
  return withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('measure_geometry');
    const targetShape = resolveEntityShape(kernel, shape, targetEntityId);
    if (!targetShape) {
      return {
        file_path: filePath,
        target_entity_id: targetEntityId,
        error: `target "${targetEntityId}" not found`,
      };
    }

    const results = entityIds.map((sourceId) => {
      const sourceShape = resolveEntityShape(kernel, shape, sourceId);
      if (!sourceShape) {
        return { source_entity_id: sourceId, error: 'entity not found' };
      }
      const distance = kernel.distanceBetween(sourceShape, targetShape);
      const pair: DistancePairResult = {
        source_entity_id: sourceId,
        target_entity_id: targetEntityId,
        distance,
      };
      if (includeExtrema) {
        pair.extrema = buildExtrema(kernel, sourceShape, targetShape);
      }
      return pair;
    });

    return {
      file_path: filePath,
      target_entity_id: targetEntityId,
      results,
    };
  });
}

function buildExtrema(
  kernel: {
    distanceExtrema(
      a: ShapeHandle,
      b: ShapeHandle,
    ): Array<{
      pointA: { x: number; y: number; z: number };
      pointB: { x: number; y: number; z: number };
    }>;
  },
  source: ShapeHandle,
  target: ShapeHandle,
) {
  const extremaPairs = kernel.distanceExtrema(source, target).map((p) => {
    const dx = p.pointB.x - p.pointA.x;
    const dy = p.pointB.y - p.pointA.y;
    const dz = p.pointB.z - p.pointA.z;
    return {
      distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
      point_on_source: [p.pointA.x, p.pointA.y, p.pointA.z] as [number, number, number],
      point_on_target: [p.pointB.x, p.pointB.y, p.pointB.z] as [number, number, number],
    };
  });
  const distances = extremaPairs.map((p) => p.distance);
  return {
    pair_count: extremaPairs.length,
    min_distance: distances.length > 0 ? Math.min(...distances) : undefined,
    max_distance: distances.length > 0 ? Math.max(...distances) : undefined,
    pairs: extremaPairs,
  };
}
