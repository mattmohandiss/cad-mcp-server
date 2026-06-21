import { describe, expect, it } from 'vitest';
import { adaptFindStepEdges, adaptFindStepFaces, adaptPmiQuery } from '../tools/step-tools.js';

describe('public query adapters', () => {
  it('maps face find arguments to the internal query shape without IDs', () => {
    expect(
      adaptFindStepFaces({
        body_ids: ['body:0'],
        surface_types: ['plane'],
        area_min: 10,
        fields: ['id', 'bbox_center', 'adjacent_faces'],
        sort: { by: 'area', direction: 'desc' },
        return_type: 'groups',
      })
    ).toMatchObject({
      filter: {
        body_ids: ['body:0'],
        surface_type: ['plane'],
        area_min: 10,
      },
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
        radius: { min: 4 },
        fields: ['id', 'bbox_center'],
        sort: { by: 'radius' },
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

  it('rejects invalid range bounds in find adapters', () => {
    expect(() => adaptFindStepFaces({ area_min: 100, area_max: 10 })).toThrow(
      'area_min must be less than or equal to area_max.'
    );
    expect(() => adaptFindStepEdges({ length_min: 100, length_max: 1 })).toThrow(
      'length_min must be less than or equal to length_max.'
    );
  });

  it('maps PMI arguments to the internal query shape', () => {
    expect(
      adaptPmiQuery({
        pmi_types: ['geometric_tolerance'],
        tolerance_subtypes: ['position'],
        value_min: 0.01,
        value_max: 0.1,
        sort: { by: 'value', direction: 'asc' },
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
