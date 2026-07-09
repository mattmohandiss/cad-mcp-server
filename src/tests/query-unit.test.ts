import { describe, expect, it } from 'vitest';
import type { ExtractedEdgeEntity, ExtractedFaceEntity } from '../kernel/query-entities.js';
import { applyEdgeFilters, projectEdge, sortEdges } from '../query/edges.js';
import { applyFaceFilters, projectFace, sortFaces } from '../query/faces.js';
import {
  DEFAULT_QUERY_LIMITS,
  axisDirectionKey,
  createPagination,
  groupEntities,
  magnitudeBucketKey,
  normalizePagination,
  sampleEntityIds,
} from '../query/utils.js';
import { angleDegreesNormalized, normalizeVector } from '../utils/vectors.js';

describe('vector utilities', () => {
  it('normalizes vectors and computes angles', () => {
    expect(normalizeVector([3, 0, 0])).toEqual([1, 0, 0]);
    expect(normalizeVector([0, 0, 0])).toEqual([0, 0, 0]);
    expect(angleDegreesNormalized([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
    expect(angleDegreesNormalized([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180);
    expect(angleDegreesNormalized([1, 0, 0], [0, 1, 0])).toBeCloseTo(90);
  });
});

describe('query utilities', () => {
  it('normalizes pagination and reports has_more', () => {
    expect(normalizePagination(undefined, undefined)).toEqual({ limit: 100, offset: 0 });
    expect(normalizePagination(50, 10)).toEqual({ limit: 50, offset: 10 });
    expect(createPagination(10, 0, 10, 25)).toMatchObject({ returned: 10, has_more: true });
    expect(createPagination(10, 20, 5, 25)).toMatchObject({ returned: 5, has_more: false });
  });

  it('buckets magnitudes and axis directions', () => {
    expect(magnitudeBucketKey(0.5)).toBe('0-1');
    expect(magnitudeBucketKey(5)).toBe('1-10');
    expect(magnitudeBucketKey(50)).toBe('10-100');
    expect(magnitudeBucketKey(50000)).toBe('10000+');
    expect(axisDirectionKey([0, 0, 1])).toBe('+Z');
    expect(axisDirectionKey([-1, 0, 0])).toBe('-X');
    expect(axisDirectionKey([1, 1, 0])).toBe('off-axis');
    expect(axisDirectionKey([0, 0, 0])).toBe('undefined');
  });

  it('groups entities with stable sample metadata', () => {
    const entities = [
      { id: 'face:0', surface: 'plane' },
      { id: 'face:1', surface: 'cylinder' },
      { id: 'face:2', surface: 'plane' },
    ];
    const groups = groupEntities(
      entities,
      ['surface'],
      (entity, dimension) => (dimension === 'surface' ? entity.surface : null),
      DEFAULT_QUERY_LIMITS.sample_entity_limit,
    );
    expect(groups[0].id).toMatch(/^group:\d+$/);
    expect(groups[0].entity_count).toBe(2);
    expect(groups[0].sample_is_complete).toBe(true);
  });

  it('samples entity IDs without randomization', () => {
    expect(sampleEntityIds(['a', 'b', 'c'], 2)).toEqual({
      sampled: ['a', 'b'],
      is_complete: false,
    });
    expect(sampleEntityIds(['a', 'b'], 5)).toEqual({ sampled: ['a', 'b'], is_complete: true });
  });
});

describe('face query logic', () => {
  it('filters by type, ranges, body, quality, and normal', () => {
    const faces = [
      makeFace({ id: 'face:0', surface_type: 'plane', area: 10, normal: [0, 0, 1] }),
      makeFace({ id: 'face:1', surface_type: 'cylinder', area: 50, radius: 5 }),
      makeFace({ id: 'face:2', surface_type: 'plane', area: 100, body_id: 'body:1' }),
    ];

    expect(applyFaceFilters(faces, { where: { surface_type: 'plane' } })).toHaveLength(2);
    expect(applyFaceFilters(faces, { where: { area_min: 20, area_max: 80 } })[0].id).toBe('face:1');
    expect(applyFaceFilters(faces, { where: { radius_min: 4 } })[0].id).toBe('face:1');
    expect(applyFaceFilters(faces, { where: { body_ids: ['body:1'] } })[0].id).toBe('face:2');
    expect(
      applyFaceFilters(faces, {
        where: { normal: { parallel_to: [0, 0, 1], tolerance_degrees: 5 } },
      })[0].id,
    ).toBe('face:0');
  });

  it('sorts and projects requested fields', () => {
    const faces = [
      makeFace({ id: 'face:0', area: 10, bbox_center: [0, 0, 0], radius: 4 }),
      makeFace({ id: 'face:1', area: 100, bbox_center: [50, 0, 0], radius: 2 }),
    ];

    expect(sortFaces(faces, { by: 'area', direction: 'desc' })[0].id).toBe('face:1');
    expect(sortFaces(faces, { by: 'center_x' })[0].id).toBe('face:0');
    expect(sortFaces(faces, { by: 'diameter' }).map((face) => face.id)).toEqual([
      'face:1',
      'face:0',
    ]);
    expect(projectFace(faces[0], ['id', 'radius', 'diameter'])).toEqual({
      id: 'face:0',
      radius: 4,
      diameter: 8,
      body_id: 'body:0',
    });
  });
});

describe('edge query logic', () => {
  it('filters by type, ranges, body, IDs, and dihedral angle', () => {
    const edges = [
      makeEdge({ id: 'edge:0', curve_type: 'line', length: 10, dihedral_angle_deg: 15 }),
      makeEdge({ id: 'edge:1', curve_type: 'circle', length: 31.4, radius: 5 }),
      makeEdge({ id: 'edge:2', curve_type: 'circle', length: 62.8, radius: 10, body_id: 'body:1' }),
    ];

    expect(applyEdgeFilters(edges, { where: { curve_type: 'circle' } })).toHaveLength(2);
    expect(applyEdgeFilters(edges, { where: { length_min: 30, length_max: 50 } })[0].id).toBe(
      'edge:1',
    );
    expect(applyEdgeFilters(edges, { where: { radius_min: 8 } })[0].id).toBe('edge:2');
    expect(applyEdgeFilters(edges, { entity_ids: ['edge:0', 'edge:2'] })).toHaveLength(2);
    expect(applyEdgeFilters(edges, { where: { body_ids: ['body:1'] } })[0].id).toBe('edge:2');
    expect(applyEdgeFilters(edges, { where: { dihedral_max_deg: 30 } })[0].id).toBe('edge:0');
  });

  it('sorts and projects requested fields', () => {
    const edges = [makeEdge({ id: 'edge:0', radius: 4 }), makeEdge({ id: 'edge:1', radius: 2 })];

    expect(sortEdges(edges, { by: 'diameter' }).map((edge) => edge.id)).toEqual([
      'edge:1',
      'edge:0',
    ]);
    expect(projectEdge(edges[0], ['id', 'radius', 'diameter'])).toEqual({
      id: 'edge:0',
      radius: 4,
      diameter: 8,
      body_id: 'body:0',
    });
  });
});

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
