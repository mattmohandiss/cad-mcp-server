import type { ShapeHandle } from 'occt-wasm';
import type { OcctKernel } from 'occt-wasm';
import type {
  MeasureResults,
  MeasureSpec,
  MeasureOpResult,
  RayGridResult,
} from '../query/measure.js';
import { dispatchMeasure } from '../query/measure.js';
import { withStepModel } from '../model-store.js';
import { parseEntityId } from '../utils/ids.js';

export interface BatchMeasureResult {
  entity_id: string;
  entity_type: string;
  results: MeasureResults;
  resolved_direction?: number[];
  hit_summary?: MeasureHitSummary;
}

export interface MeasureHitSummary {
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

export function resolveEntityShape(
  kernel: OcctKernel,
  shape: ShapeHandle,
  entityId: string,
): ShapeHandle | undefined {
  const parsed = parseEntityId(entityId);
  if (!parsed) return undefined;
  const kernelType = parsed.type === 'body' ? 'solid' : parsed.type;
  try {
    return kernel.getSubShapes(shape, kernelType)[parsed.index];
  } catch {
    return undefined;
  }
}

export async function batchMeasure(
  filePath: string,
  entityIds: string[],
  specs: MeasureSpec[],
): Promise<BatchMeasureResult[]> {
  return withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('measure_geometry');
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
        resolvedSpecs = stripShortcuts(specs);
      } else if (parsed.type === 'body') {
        const solids = kernel.getSubShapes(shape, 'solid');
        if (parsed.index >= solids.length) {
          results.push({ entity_id: id, entity_type: 'body', results: {} });
          continue;
        }
        handle = solids[parsed.index];
        resolvedSpecs = stripShortcuts(specs);
      } else {
        results.push({ entity_id: id, entity_type: parsed.type, results: {} });
        continue;
      }

      const bbox = kernel.getBoundingBox(handle, false);
      const measureResults = dispatchMeasure(kernel, shape, handle, resolvedSpecs, {
        current_extent_min: [bbox.xmin, bbox.ymin, bbox.zmin],
        current_extent_max: [bbox.xmax, bbox.ymax, bbox.zmax],
      });
      const detailLevel = resolvedSpecs[0]?.detail_level ?? 'aggregate';
      stripRawGridData(measureResults, detailLevel);
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

export function mapDirectionMode(mode: 'axis' | 'normal' | undefined): string | undefined {
  if (mode === 'axis') return 'along_axis';
  if (mode === 'normal') return 'normal';
  return undefined;
}

function stripShortcuts(specs: MeasureSpec[]): MeasureSpec[] {
  return specs.map((s) => {
    if (!s.direction_shortcut) return s;
    const { direction_shortcut: _unused, ...rest } = s;
    void _unused;
    return rest;
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

    const { direction_shortcut: _unused, ...rest } = spec;
    void _unused;

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

export function stripRawGridData(results: MeasureResults, detailLevel: string): void {
  const grid = results.ray_test_grid;
  if (detailLevel === 'aggregate' && isRayGridResult(grid)) {
    if (grid.hit_distance && grid.hit_distance.length > 0) {
      const sorted = [...grid.hit_distance].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      grid.statistics = {
        min_distance: sorted[0],
        max_distance: sorted[sorted.length - 1],
        avg_distance: sorted.reduce((s, v) => s + v, 0) / sorted.length,
        median_distance: median,
        hit_count: sorted.length,
        miss_count: (grid.total_rays ?? 0) - sorted.length,
      };
    }
    delete grid.hits;
    delete grid.hit_distance;
  }
}

export function buildHitSummary(results: MeasureResults): MeasureHitSummary | undefined {
  const grid = results.ray_test_grid;
  if (isRayGridResult(grid)) {
    if (grid.statistics) {
      return {
        total_rays: grid.total_rays ?? 0,
        hit_count: grid.statistics.hit_count,
        miss_count: grid.statistics.miss_count,
        hit_distances: {
          min: grid.statistics.min_distance,
          max: grid.statistics.max_distance,
          avg: grid.statistics.avg_distance,
          median: grid.statistics.median_distance,
        },
      };
    }
    if (grid.hit_distance && grid.total_rays !== undefined) {
      const hits = grid.hit_distance;
      if (hits.length === 0) {
        return {
          total_rays: grid.total_rays,
          hit_count: 0,
          miss_count: grid.total_rays,
        };
      }
      const sorted = [...hits].sort((a, b) => a - b);
      return {
        total_rays: grid.total_rays,
        hit_count: hits.length,
        miss_count: grid.total_rays - hits.length,
        hit_distances: {
          min: sorted[0],
          max: sorted[sorted.length - 1],
          avg: sorted.reduce((s, v) => s + v, 0) / hits.length,
          median: sorted[Math.floor(sorted.length / 2)],
        },
      };
    }
  }

  for (const value of [results.ray_test, results.ray_test_segment]) {
    if (Array.isArray(value)) {
      const hits = value.map((h) => h.distance).filter((d): d is number => typeof d === 'number');
      if (hits.length > 0) {
        const sorted = [...hits].sort((a, b) => a - b);
        return {
          hit_count: hits.length,
          hit_distances: {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sorted.reduce((s, v) => s + v, 0) / hits.length,
            median: sorted[Math.floor(sorted.length / 2)],
          },
        };
      }
    }
  }

  const distance = results.distance;
  if (typeof distance === 'number') {
    return {
      hit_distances: { min: distance, max: distance, avg: distance, median: distance },
    };
  }
  return undefined;
}

function isRayGridResult(value: MeasureOpResult | undefined): value is RayGridResult {
  return (
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('hits' in value || 'hit_distance' in value || 'total_rays' in value || 'statistics' in value)
  );
}
