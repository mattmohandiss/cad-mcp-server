/**
 * measure_step — batch geometric measurement on known entity IDs.
 *
 * Accepts entity IDs from query_faces/query_edges results and runs
 * measurement operations in batch. Supports direction shortcuts
 * ("along_axis", "normal", etc.) that resolve per-entity.
 */

import type { ShapeHandle } from 'occt-wasm';
import type { MeasureSpec, MeasureResults } from '../query/measure.js';
import { dispatchMeasure } from '../query/measure.js';
import { withStepModel } from '../model-store.js';
import { parseEntityId } from '../utils/ids.js';
import { wrapTool } from './shared.js';
import type { MeasureStepInput } from '../schemas/tool-schemas.js';

interface BatchMeasureResult {
  entity_id: string;
  entity_type: string;
  results: MeasureResults;
  resolved_direction?: number[];
  hit_summary?: MeasureHitSummary;
}

interface MeasureHitSummary {
  total_rays?: number;
  hit_count?: number;
  miss_count?: number;
  hit_distances?: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
}

export async function handleMeasureStep(args: MeasureStepInput) {
  return wrapTool(async () => {
    const spec = buildMeasureSpec(args);
    const results = await batchMeasure(args.file_path, args.entity_ids, [spec]);

    return {
      schema_version: '0.4',
      file_path: args.file_path,
      operation: args.op,
      entity_count: args.entity_ids.length,
      results,
    };
  });
}

function buildMeasureSpec(args: MeasureStepInput): MeasureSpec {
  const base: MeasureSpec = { op: args.op };

  if (args.direction !== undefined) {
    if (Array.isArray(args.direction)) {
      base.direction = args.direction;
    } else {
      base.direction_shortcut = args.direction;
    }
  }

  if (args.origin !== undefined) {
    base.origin = args.origin;
  }
  if (args.tmax !== undefined) {
    base.tmax = args.tmax;
  }
  if (args.spacing_mm !== undefined) {
    base.spacing_mm = args.spacing_mm;
  }
  if (args.to !== undefined) {
    const to = args.to;
    base.to = Array.isArray(to) ? to[0] : to;
  }
  if (args.plane_origin !== undefined) {
    base.plane_origin = args.plane_origin;
  }
  if (args.plane_normal !== undefined) {
    base.plane_normal = args.plane_normal;
  }
  if (args.param !== undefined) {
    base.param = args.param;
  }
  if (args.with !== undefined) {
    base.with = args.with;
  }
  if (args.point !== undefined) {
    base.point = args.point;
  }
  if (args.tolerance !== undefined) {
    base.tolerance = args.tolerance;
  }

  return base;
}

async function batchMeasure(
  filePath: string,
  entityIds: string[],
  specs: MeasureSpec[],
): Promise<BatchMeasureResult[]> {
  return withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('measure_step');
    const faces = await model.getFaceEntities();
    const edges = await model.getEdgeEntities();

    const faceShapes = kernel.getSubShapes(shape, 'face');
    const edgeShapes = kernel.getSubShapes(shape, 'edge');

    const results: BatchMeasureResult[] = [];

    for (const id of entityIds) {
      const parsed = parseEntityId(id);
      if (!parsed) {
        results.push({ entity_id: id, entity_type: 'unknown', results: {} });
        continue;
      }

      let handle: ShapeHandle;
      let resolvedSpecs: MeasureSpec[];
      let resolvedDirection: number[] | undefined;

      if (parsed.type === 'face') {
        const face = faces[parsed.index];
        if (!face || parsed.index >= faceShapes.length) {
          results.push({ entity_id: id, entity_type: 'face', results: {} });
          continue;
        }
        handle = faceShapes[parsed.index];
        resolvedSpecs = resolveDirectionShortcuts(specs, face.axis?.direction, face.normal);
        resolvedDirection = getResolvedDirection(specs[0], face.axis?.direction, face.normal);
      } else if (parsed.type === 'edge') {
        const edge = edges[parsed.index];
        if (!edge || parsed.index >= edgeShapes.length) {
          results.push({ entity_id: id, entity_type: 'edge', results: {} });
          continue;
        }
        handle = edgeShapes[parsed.index];
        // Edges don't have axis/normal; direction shortcuts won't resolve.
        resolvedSpecs = specs.map((s) => {
          if (!s.direction_shortcut) return s;
          const { direction_shortcut: __unused, ...rest } = s as MeasureSpec & {
            direction_shortcut?: string;
          };
          void __unused;
          return rest;
        });
      } else {
        results.push({ entity_id: id, entity_type: parsed.type, results: {} });
        continue;
      }

      const measureResults = dispatchMeasure(kernel, shape, handle, resolvedSpecs);
      const hitSummary = buildHitSummary(measureResults);

      results.push({
        entity_id: id,
        entity_type: parsed.type,
        results: measureResults,
        resolved_direction: resolvedDirection,
        hit_summary: hitSummary,
      });
    }

    return results;
  });
}

function resolveDirectionShortcuts(
  specs: MeasureSpec[],
  axisDirection?: number[],
  normalDirection?: number[],
): MeasureSpec[] {
  return specs.map((spec) => {
    const shortcut = spec.direction_shortcut;
    if (!shortcut) return spec;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { direction_shortcut: __, ...rest } = spec;

    switch (shortcut) {
      case 'along_axis':
        if (axisDirection) return { ...rest, direction: axisDirection };
        break;
      case 'along_axis_both':
        if (axisDirection) return { ...rest, direction: axisDirection };
        break;
      case 'normal':
        if (normalDirection) return { ...rest, direction: normalDirection };
        break;
    }
    return rest;
  });
}

function getResolvedDirection(
  spec: MeasureSpec,
  axisDirection?: number[],
  normalDirection?: number[],
): number[] | undefined {
  const shortcut = spec.direction_shortcut;
  if (!shortcut) return undefined;
  if (shortcut === 'along_axis' || shortcut === 'along_axis_both') return axisDirection;
  if (shortcut === 'normal') return normalDirection;
  return undefined;
}

function buildHitSummary(results: MeasureResults): MeasureHitSummary | undefined {
  for (const [opName, value] of Object.entries(results)) {
    if (opName === 'ray_test_grid' && value && typeof value === 'object') {
      const grid = value as { hit_distance?: number[]; total_rays?: number };
      if (grid.hit_distance && grid.total_rays !== undefined) {
        const hits = grid.hit_distance;
        const sorted = [...hits].sort((a, b) => a - b);
        return {
          total_rays: grid.total_rays,
          hit_count: hits.length,
          miss_count: grid.total_rays - hits.length,
          hit_distances: {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
            median: sorted[Math.floor(sorted.length / 2)],
          },
        };
      }
    }
    if ((opName === 'ray_test' || opName === 'ray_test_segment') && Array.isArray(value)) {
      const hits = (value as Array<{ distance?: number }>)
        .map((h) => h.distance)
        .filter((d): d is number => typeof d === 'number');
      if (hits.length > 0) {
        const sorted = [...hits].sort((a, b) => a - b);
        return {
          hit_count: hits.length,
          hit_distances: {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
            median: sorted[Math.floor(sorted.length / 2)],
          },
        };
      }
    }
    if (opName === 'distance' && typeof value === 'number') {
      return {
        hit_distances: { min: value, max: value, avg: value, median: value },
      };
    }
  }
  return undefined;
}
