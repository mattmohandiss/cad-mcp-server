import { describe, expect, it } from 'vitest';
import { adaptFindStepEdges, adaptFindStepFaces, adaptPmiQuery } from '../tools/step-tools.js';

describe('public query adapters', () => {
  it('maps face find arguments to the internal query shape without IDs', () => {
    expect(
      adaptFindStepFaces({
        body_ids: ['body:0'],
        surface_types: ['plane'],
        area_min: 10,
        bbox_min: [0, 0, 0],
        bbox_max: [1, 2, 3],
        center_near_point: [1, 1, 1],
        center_near_distance: 5,
        fields: ['id', 'bbox_center', 'adjacent_faces'],
        sort_by: 'area',
        sort_direction: 'desc',
        return_type: 'groups',
      })
    ).toMatchObject({
      filter: {
        body_ids: ['body:0'],
        surface_type: ['plane'],
        area_min: 10,
      },
      region: { bbox: { min: [0, 0, 0], max: [1, 2, 3] }, mode: 'intersects' },
      near: { point: [1, 1, 1], distance: 5 },
      include: ['id', 'center', 'adjacent_faces'],
      sort: { by: 'area', direction: 'desc' },
      result_mode: 'groups',
    });
  });

  it('maps edge find arguments to the internal query shape without IDs', () => {
    expect(
      adaptFindStepEdges({
        curve_types: ['circle'],
        length_max: 12,
        radius_min: 4,
        fields: ['id', 'bbox_center'],
        sort_by: 'radius',
      })
    ).toMatchObject({
      filter: {
        curve_type: ['circle'],
        length_max: 12,
        radius_min: 4,
      },
      include: ['id', 'center'],
      sort: { by: 'radius' },
    });
  });

  it('rejects invalid spatial pairs in find adapters', () => {
    expect(() => adaptFindStepFaces({ bbox_min: [0, 0, 0] })).toThrow(
      'bbox_min and bbox_max must be provided together.'
    );
    expect(() => adaptFindStepEdges({ center_near_distance: 5 })).toThrow(
      'center_near_point and center_near_distance must be provided together.'
    );
  });

  it('maps flat PMI arguments to the internal query shape', () => {
    expect(
      adaptPmiQuery({
        pmi_types: ['geometric_tolerance'],
        tolerance_subtypes: ['position'],
        value_min: 0.01,
        value_max: 0.1,
        sort_by: 'value',
        sort_direction: 'asc',
        return_type: 'summary',
      })
    ).toMatchObject({
      filter: {
        pmi_types: ['geometric_tolerance'],
        tolerance_types: ['position'],
        value_min: 0.01,
        value_max: 0.1,
      },
      sort: { by: 'value', direction: 'asc' },
      result_mode: 'summary',
    });
  });
});
