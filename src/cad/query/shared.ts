import type {
  StepQueryResponse,
  StepQueryPagination,
  StepQueryUnits,
  StepQueryCoordinateSystem,
} from '../../tools/step-tools.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import { normalizeVector, angleDegreesNormalized } from '../../utils/vectors.js';

/**
 * Shared query utilities for pagination, filtering, sorting, and response envelopes.
 */

export const DEFAULT_QUERY_LIMITS = {
  limit: 100,
  offset: 0,
  sample_entity_limit: 5,
  max_page_size: 1000,
} as const;

/**
 * Hardcoded bucket widths for continuous-value grouping.
 * Single source of truth; the model does not control these.
 */
export const GROUP_BUCKETS: {
  magnitude_bins: number[];
  radius_step: number;
  axis_snap_degrees: number;
} = {
  // Log-scale magnitude bins (mm or mm^2) for size dimensions.
  // A value v falls in the first bin whose upper bound exceeds it.
  magnitude_bins: [1, 10, 100, 1000, 10000],
  // Round radius/diameter to this granularity (mm) to separate standard sizes
  // while merging floating-point noise.
  radius_step: 0.5,
  // Faces/edges within this angle (degrees) of a principal axis snap to it.
  axis_snap_degrees: 15,
};

/**
 * Bucket a continuous magnitude (length, area, depth) into a labelled range
 * using fixed log-scale bins. Returns a stable string key like "10-100".
 */
export function magnitudeBucketKey(value: number): string {
  const bins = GROUP_BUCKETS.magnitude_bins;
  if (value < bins[0]) return `0-${bins[0]}`;
  for (let i = 0; i < bins.length - 1; i++) {
    if (value < bins[i + 1]) return `${bins[i]}-${bins[i + 1]}`;
  }
  return `${bins[bins.length - 1]}+`;
}

/**
 * Bucket a radius or diameter by rounding to the nearest fixed step.
 * Returns the rounded numeric value (used directly as the group key).
 */
export function radiusBucketValue(value: number): number {
  const step = GROUP_BUCKETS.radius_step;
  return Math.round(value / step) * step;
}

/**
 * Snap a direction vector to the nearest principal axis (+X..-Z) when within
 * the axis-snap tolerance; otherwise return "off-axis". Keys are stable strings.
 */
export function axisDirectionKey(direction: number[]): string {
  const unit = normalizeVector(direction);
  if (unit[0] === 0 && unit[1] === 0 && unit[2] === 0) return 'undefined';
  const axes: Array<{ key: string; vec: number[] }> = [
    { key: '+X', vec: [1, 0, 0] },
    { key: '-X', vec: [-1, 0, 0] },
    { key: '+Y', vec: [0, 1, 0] },
    { key: '-Y', vec: [0, -1, 0] },
    { key: '+Z', vec: [0, 0, 1] },
    { key: '-Z', vec: [0, 0, -1] },
  ];
  let best = 'off-axis';
  let bestAngle = GROUP_BUCKETS.axis_snap_degrees;
  for (const axis of axes) {
    const angle = angleDegreesNormalized(unit, axis.vec);
    if (angle <= bestAngle) {
      bestAngle = angle;
      best = axis.key;
    }
  }
  return best;
}

/**
 * A computed group of entities sharing a key across one or more dimensions.
 */
export interface ComputedGroup {
  id: string;
  key: Record<string, unknown>;
  entity_count: number;
  entity_ids: string[];
  sample_entity_ids: string[];
  sample_entity_limit: number;
  sample_is_complete: boolean;
  summary: Record<string, unknown>;
}

/**
 * Group entities deterministically by a composite key derived from each
 * requested dimension. Groups are sorted by descending entity count, then by
 * key for stable ordering. Each group includes bounded sample entity IDs.
 */
export function groupEntities<T extends { id: string }>(
  entities: T[],
  dimensions: string[],
  keyOf: (entity: T, dimension: string) => unknown,
  sampleLimit: number,
  summarize?: (members: T[]) => Record<string, unknown>
): ComputedGroup[] {
  const buckets = new Map<string, { key: Record<string, unknown>; members: T[] }>();

  for (const entity of entities) {
    const key: Record<string, unknown> = {};
    for (const dimension of dimensions) {
      key[dimension] = keyOf(entity, dimension);
    }
    const mapKey = JSON.stringify(dimensions.map((d) => key[d]));
    let bucket = buckets.get(mapKey);
    if (!bucket) {
      bucket = { key, members: [] };
      buckets.set(mapKey, bucket);
    }
    bucket.members.push(entity);
  }

  const groups = [...buckets.values()].map((bucket) => {
    const ids = bucket.members.map((m) => m.id);
    const { sampled, is_complete } = sampleEntityIds(ids, sampleLimit);
    return {
      key: bucket.key,
      entity_count: bucket.members.length,
      entity_ids: ids,
      sample_entity_ids: sampled,
      sample_entity_limit: sampleLimit,
      sample_is_complete: is_complete,
      summary: summarize ? summarize(bucket.members) : {},
    };
  });

  // Deterministic ordering: largest groups first, then by key string.
  groups.sort((a, b) => {
    if (b.entity_count !== a.entity_count) return b.entity_count - a.entity_count;
    return JSON.stringify(a.key).localeCompare(JSON.stringify(b.key));
  });

  return groups.map((group, i) => ({ id: `group:${i}`, ...group }));
}

export function normalizePagination(
  limit: number | undefined,
  offset: number | undefined
): { limit: number; offset: number } {
  return {
    limit: limit ?? DEFAULT_QUERY_LIMITS.limit,
    offset: offset ?? DEFAULT_QUERY_LIMITS.offset,
  };
}

export function createPagination(
  limit: number,
  offset: number,
  returned: number,
  total_matched: number
): StepQueryPagination {
  return {
    limit,
    offset,
    returned,
    total_matched,
    has_more: offset + returned < total_matched,
  };
}

export const STEP_QUERY_UNITS: StepQueryUnits = {
  length: 'mm',
  area: 'mm^2',
  volume: 'mm^3',
  angle: 'deg',
};

export const STEP_QUERY_COORDINATE_SYSTEM: StepQueryCoordinateSystem = {
  origin: 'STEP model origin',
  axes: 'model coordinates',
  handedness: 'right',
};

/**
 * Build a query response envelope.
 */
export function createQueryResponse<T extends Record<string, unknown>>(
  file_path: string,
  query: Record<string, unknown>,
  pagination: StepQueryPagination,
  entities: T[],
  statistics?: Record<string, unknown>,
  groups: ComputedGroup[] = [],
  warnings: unknown[] = [],
  limitations: unknown[] = []
): StepQueryResponse<T> {
  return {
    schema_version: CAD_RESPONSE_SCHEMA_VERSION,
    file_path,
    units: STEP_QUERY_UNITS,
    coordinate_system: STEP_QUERY_COORDINATE_SYSTEM,
    query,
    statistics: statistics ?? {},
    pagination,
    entities,
    groups: groups.map((g) => ({
      id: g.id,
      key: g.key,
      entity_count: g.entity_count,
      sample_entity_ids: g.sample_entity_ids,
      sample_entity_limit: g.sample_entity_limit,
      sample_is_complete: g.sample_is_complete,
      summary: g.summary,
    })),
    warnings,
    limitations,
  };
}

/**
 * Sample entity IDs from a larger set, deterministically.
 */
export function sampleEntityIds(
  entity_ids: string[],
  sample_limit: number
): { sampled: string[]; is_complete: boolean } {
  if (sample_limit <= 0) {
    return { sampled: [], is_complete: entity_ids.length === 0 };
  }
  const sampled = entity_ids.slice(0, sample_limit);
  return {
    sampled,
    is_complete: sampled.length === entity_ids.length,
  };
}
