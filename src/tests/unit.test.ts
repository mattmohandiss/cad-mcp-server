import { describe, expect, it } from 'vitest';
import { normalizeVector, angleDegreesNormalized } from '../utils/vectors.js';
import {
  createPagination,
  magnitudeBucketKey,
  axisDirectionKey,
  groupEntities,
  normalizePagination,
  sampleEntityIds,
  DEFAULT_QUERY_LIMITS,
} from '../query/shared.js';

// ---------------------------------------------------------------------------
// Vector utilities
// ---------------------------------------------------------------------------
describe('vector utilities', () => {
  it('normalizes a non-zero vector', () => {
    const v = normalizeVector([3, 0, 0]);
    expect(v[0]).toBeCloseTo(1);
    expect(v[1]).toBeCloseTo(0);
    expect(v[2]).toBeCloseTo(0);
  });

  it('returns zero vector for zero input', () => {
    const v = normalizeVector([0, 0, 0]);
    expect(v).toEqual([0, 0, 0]);
  });

  it('angle between parallel vectors is 0', () => {
    expect(angleDegreesNormalized([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
  });

  it('angle between opposite vectors is 180', () => {
    expect(angleDegreesNormalized([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180);
  });

  it('angle between perpendicular vectors is 90', () => {
    expect(angleDegreesNormalized([1, 0, 0], [0, 1, 0])).toBeCloseTo(90);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('pagination', () => {
  it('normalizePagination uses defaults when undefined', () => {
    expect(normalizePagination(undefined, undefined)).toEqual({ limit: 100, offset: 0 });
  });

  it('normalizePagination respects custom values', () => {
    expect(normalizePagination(50, 10)).toEqual({ limit: 50, offset: 10 });
  });

  it('createPagination sets has_more correctly', () => {
    const p = createPagination(10, 0, 10, 25);
    expect(p.returned).toBe(10);
    expect(p.total_matched).toBe(25);
    expect(p.has_more).toBe(true);
  });

  it('createPagination has_more false when last page', () => {
    const p = createPagination(10, 20, 5, 25);
    expect(p.returned).toBe(5);
    expect(p.has_more).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bucketing and grouping
// ---------------------------------------------------------------------------
describe('magnitude bucket', () => {
  it('buckets below first bin', () => {
    expect(magnitudeBucketKey(0.5)).toBe('0-1');
  });

  it('buckets in first range', () => {
    expect(magnitudeBucketKey(5)).toBe('1-10');
  });

  it('buckets in middle range', () => {
    expect(magnitudeBucketKey(50)).toBe('10-100');
  });

  it('buckets above last bin', () => {
    expect(magnitudeBucketKey(50000)).toBe('10000+');
  });
});

describe('axis direction key', () => {
  it('snaps to +Z', () => {
    expect(axisDirectionKey([0, 0, 1])).toBe('+Z');
  });

  it('snaps to -X', () => {
    expect(axisDirectionKey([-1, 0, 0])).toBe('-X');
  });

  it('returns off-axis for diagonal', () => {
    // [1,1,0] is 45° from +X and +Y, both outside the 15° snap tolerance
    expect(axisDirectionKey([1, 1, 0])).toBe('off-axis');
  });

  it('returns undefined for zero vector', () => {
    expect(axisDirectionKey([0, 0, 0])).toBe('undefined');
  });
});

// ---------------------------------------------------------------------------
// groupEntities
// ---------------------------------------------------------------------------
describe('groupEntities', () => {
  const entities = [
    { id: 'face:0', surface: 'plane', area: 10 },
    { id: 'face:1', surface: 'cylinder', area: 50 },
    { id: 'face:2', surface: 'plane', area: 100 },
    { id: 'face:3', surface: 'plane', area: 200 },
  ];

  it('groups by a single dimension', () => {
    const groups = groupEntities(
      entities,
      ['surface'],
      (e, dim) => (dim === 'surface' ? e.surface : null),
      DEFAULT_QUERY_LIMITS.sample_entity_limit,
    );
    expect(groups.length).toBe(2);
    const planeGroup = groups.find((g) => g.key.surface === 'plane');
    expect(planeGroup?.entity_count).toBe(3);
    expect(planeGroup?.sample_entity_ids.length).toBe(3);
  });

  it('sorts groups by entity count descending', () => {
    const groups = groupEntities(
      entities,
      ['surface'],
      (e, dim) => (dim === 'surface' ? e.surface : null),
      5,
    );
    expect(groups[0].entity_count).toBeGreaterThanOrEqual(groups[1].entity_count);
  });

  it('respects sample limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `e:${i}`, type: 'x' }));
    const groups = groupEntities(
      many,
      ['type'],
      () => 'x',
      3,
    );
    expect(groups[0].sample_entity_ids.length).toBe(3);
    expect(groups[0].sample_is_complete).toBe(false);
  });

  it('generates group IDs like group:0, group:1', () => {
    const groups = groupEntities(entities, ['surface'], (e, d) => e.surface as never, 5);
    expect(groups[0].id).toMatch(/^group:\d+$/);
  });
});

// ---------------------------------------------------------------------------
// sampleEntityIds
// ---------------------------------------------------------------------------
describe('sampleEntityIds', () => {
  it('returns first N when limit is smaller than total', () => {
    const result = sampleEntityIds(['a', 'b', 'c', 'd', 'e'], 3);
    expect(result.sampled).toEqual(['a', 'b', 'c']);
    expect(result.is_complete).toBe(false);
  });

  it('marks complete when all fit in limit', () => {
    const result = sampleEntityIds(['a', 'b'], 5);
    expect(result.sampled).toEqual(['a', 'b']);
    expect(result.is_complete).toBe(true);
  });

  it('handles zero limit', () => {
    const result = sampleEntityIds(['a', 'b'], 0);
    expect(result.sampled).toEqual([]);
    expect(result.is_complete).toBe(false);
  });
});
