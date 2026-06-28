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
import { applyFaceFilters, sortFaces, projectFace } from '../query/faces.js';
import { applyEdgeFilters, sortEdges, projectEdge } from '../query/edges.js';
import type { ExtractedFaceEntity, ExtractedEdgeEntity } from '../kernel/query-entities.js';

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
    const groups = groupEntities(entities, ['surface'], (e) => e.surface as never, 5);
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

// ---------------------------------------------------------------------------
// Face filters, sorting, projection
// ---------------------------------------------------------------------------

function makeFace(overrides: Partial<ExtractedFaceEntity> = {}): ExtractedFaceEntity {
  return {
    id: 'face:0',
    index: 0,
    surface_type: 'plane',
    area: 100,
    bbox: { min: [0, 0, 0], max: [10, 10, 0] },
    bbox_center: [5, 5, 0],
    normal: [0, 0, 1],
    body_id: 'body:0',
    ...overrides,
  };
}

describe('face filters', () => {
  const faces = [
    makeFace({ id: 'face:0', surface_type: 'plane', area: 10 }),
    makeFace({ id: 'face:1', surface_type: 'cylinder', area: 50 }),
    makeFace({ id: 'face:2', surface_type: 'plane', area: 100 }),
  ];

  it('filters by surface type', () => {
    const result = applyFaceFilters(faces, { surface_types: ['plane'] });
    expect(result.length).toBe(2);
    expect(result.every((f) => f.surface_type === 'plane')).toBe(true);
  });

  it('filters by area range', () => {
    const result = applyFaceFilters(faces, { area_min: 20, area_max: 80 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('face:1');
  });

  it('filters by entity IDs', () => {
    const result = applyFaceFilters(faces, { entity_ids: ['face:0', 'face:2'] });
    expect(result.length).toBe(2);
  });

  it('filters by body ID', () => {
    const facesWithBody = [
      makeFace({ id: 'face:0', body_id: 'body:0' }),
      makeFace({ id: 'face:1', body_id: 'body:1' }),
      makeFace({ id: 'face:2', body_id: undefined }),
    ];
    const result = applyFaceFilters(facesWithBody, { body_ids: ['body:0'] });
    expect(result.length).toBe(1);
    expect(result[0].body_id).toBe('body:0');
  });

  it('filters by normal direction', () => {
    const facesWithNormals = [
      makeFace({ id: 'face:0', normal: [0, 0, 1] }),
      makeFace({ id: 'face:1', normal: [1, 0, 0] }),
    ];
    const result = applyFaceFilters(facesWithNormals, {
      normal: { parallel_to: [0, 0, 1], tolerance_degrees: 5 },
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('face:0');
  });

  it('no filter returns all', () => {
    const result = applyFaceFilters(faces, {});
    expect(result.length).toBe(3);
  });
});

describe('face sorting', () => {
  const faces = [
    makeFace({ id: 'face:0', area: 10, bbox_center: [0, 0, 0], surface_type: 'plane' }),
    makeFace({ id: 'face:1', area: 100, bbox_center: [50, 0, 0], surface_type: 'cylinder' }),
    makeFace({ id: 'face:2', area: 50, bbox_center: [10, 0, 0], surface_type: 'cone' }),
  ];

  it('sorts by area ascending', () => {
    const result = sortFaces(faces, { by: 'area', direction: 'asc' });
    expect(result[0].id).toBe('face:0');
    expect(result[2].id).toBe('face:1');
  });

  it('sorts by area descending', () => {
    const result = sortFaces(faces, { by: 'area', direction: 'desc' });
    expect(result[0].id).toBe('face:1');
    expect(result[2].id).toBe('face:0');
  });

  it('sorts by surface_type alphabetically', () => {
    const result = sortFaces(faces, { by: 'surface_type' });
    expect(result[0].surface_type).toBe('cone');
    expect(result[2].surface_type).toBe('plane');
  });

  it('sorts by center_x', () => {
    const result = sortFaces(faces, { by: 'center_x' });
    expect(result[0].id).toBe('face:0');
    expect(result[2].id).toBe('face:1');
  });
});

describe('face projection', () => {
  const face = makeFace({ radius: 5, axis: { direction: [0, 0, 1], location: [1, 2, 3] } });

  it('default fields include id, surface_type, area, bbox, bbox_center, body_id', () => {
    const result = projectFace(face, undefined);
    expect(result.id).toBe('face:0');
    expect(result.surface_type).toBe('plane');
    expect(result.area).toBe(100);
    expect(result.bbox).toBeDefined();
    expect(result.bbox_center).toBeDefined();
    expect(result.body_id).toBe('body:0');
  });

  it('body_id is always surfaced even when not in fields', () => {
    const result = projectFace(face, ['id', 'surface_type']);
    expect(result.body_id).toBe('body:0');
  });

  it('respects specific field selection', () => {
    const result = projectFace(face, ['id', 'area']);
    expect(result.id).toBe('face:0');
    expect(result.area).toBe(100);
    expect(result.surface_type).toBeUndefined();
    expect(result.bbox).toBeUndefined();
  });

  it('draft_angle_deg computed when pull_direction provided', () => {
    const result = projectFace(face, ['draft_angle_deg'], [0, 0, 1]);
    expect(result.draft_angle_deg).toBeCloseTo(90, 0); // normal [0,0,1], pull [0,0,1] → 0° angle → 90° draft
  });

  it('draft_angle_deg not computed without pull_direction', () => {
    const result = projectFace(face, ['draft_angle_deg']);
    expect(result.draft_angle_deg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge filters, sorting, projection
// ---------------------------------------------------------------------------

function makeEdge(overrides: Partial<ExtractedEdgeEntity> = {}): ExtractedEdgeEntity {
  return {
    id: 'edge:0',
    index: 0,
    curve_type: 'line',
    length: 10,
    bbox: { min: [0, 0, 0], max: [10, 0, 0] },
    bbox_center: [5, 0, 0],
    body_id: 'body:0',
    ...overrides,
  };
}

describe('edge filters', () => {
  const edges = [
    makeEdge({ id: 'edge:0', curve_type: 'line', length: 10 }),
    makeEdge({ id: 'edge:1', curve_type: 'circle', length: 31.4, radius: 5 }),
    makeEdge({ id: 'edge:2', curve_type: 'circle', length: 62.8, radius: 10 }),
  ];

  it('filters by curve type', () => {
    const result = applyEdgeFilters(edges, { curve_types: ['circle'] });
    expect(result.length).toBe(2);
  });

  it('filters by length range', () => {
    const result = applyEdgeFilters(edges, { length_min: 30, length_max: 50 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('edge:1');
  });

  it('filters by radius', () => {
    const result = applyEdgeFilters(edges, { radius: { min: 8 } });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('edge:2');
  });

  it('filters by entity IDs', () => {
    const result = applyEdgeFilters(edges, { entity_ids: ['edge:0', 'edge:2'] });
    expect(result.length).toBe(2);
  });
});

describe('edge sorting', () => {
  const edges = [
    makeEdge({ id: 'edge:0', length: 10, curve_type: 'line', bbox_center: [0, 0, 0] }),
    makeEdge({ id: 'edge:1', length: 100, curve_type: 'circle', bbox_center: [50, 0, 0], radius: 5 }),
    makeEdge({ id: 'edge:2', length: 50, curve_type: 'bspline', bbox_center: [10, 0, 0] }),
  ];

  it('sorts by length ascending', () => {
    const result = sortEdges(edges, { by: 'length' });
    expect(result[0].id).toBe('edge:0');
    expect(result[2].id).toBe('edge:1');
  });

  it('sorts by curve_type', () => {
    const result = sortEdges(edges, { by: 'curve_type' });
    expect(result[0].curve_type).toBe('bspline');
  });

  it('sorts by radius (nulls treated as 0)', () => {
    const result = sortEdges(edges, { by: 'radius' });
    expect(result[2].id).toBe('edge:1'); // radius 5, largest
  });
});

describe('edge projection', () => {
  const edge = makeEdge({ radius: 5, start_vertex: 'vertex:0', end_vertex: 'vertex:1', convexity: 'convex' });

  it('default fields', () => {
    const result = projectEdge(edge, undefined);
    expect(result.id).toBe('edge:0');
    expect(result.curve_type).toBe('line');
    expect(result.length).toBe(10);
    expect(result.bbox).toBeDefined();
    expect(result.bbox_center).toBeDefined();
    expect(result.body_id).toBe('body:0');
  });

  it('body_id always surfaced', () => {
    const result = projectEdge(edge, ['id', 'curve_type']);
    expect(result.body_id).toBe('body:0');
  });

  it('includes optional fields when set', () => {
    const result = projectEdge(edge, ['start_vertex', 'end_vertex', 'convexity', 'radius']);
    expect(result.start_vertex).toBe('vertex:0');
    expect(result.end_vertex).toBe('vertex:1');
    expect(result.convexity).toBe('convex');
    expect(result.radius).toBe(5);
  });

  it('omits optional fields when not set', () => {
    const bare = makeEdge();
    const result = projectEdge(bare, ['start_vertex', 'convexity', 'radius']);
    expect(result.start_vertex).toBeUndefined();
    expect(result.convexity).toBeUndefined();
    expect(result.radius).toBeUndefined();
  });
});
