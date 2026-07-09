import { describe, expect, it } from 'vitest';
import { toQuery as toFindEdgesQuery } from '../tools/find-edges.js';
import { toQuery as toFindFacesQuery } from '../tools/find-faces.js';
import { filterInspectResult } from '../tools/inspect.js';
import { buildMeasureSpecs as buildDraftSpecs } from '../tools/measure-draft.js';
import { buildMeasureSpecs as buildGeometrySpecs } from '../tools/measure-geometry.js';
import { buildMeasureSpecs as buildThicknessSpecs } from '../tools/measure-thickness.js';

describe('tool mapping', () => {
  it('maps inspect include presets to response sections', () => {
    expect(
      filterInspectResult(
        {
          file_path: 'model.step',
          size: { units: 'mm' },
          structure: { face_count: 2 },
          health: { valid: true },
          pmi: { annotations: [] },
        },
        new Set(['size', 'health', 'pmi']),
      ),
    ).toEqual({
      file_path: 'model.step',
      size: { units: 'mm' },
      structure: { face_count: 2 },
      health: { valid: true },
      pmi: { annotations: [] },
    });
  });

  it('maps find_faces public arguments to query fields', () => {
    const query = toFindFacesQuery({
      file_path: 'model.step',
      filters: {
        type: 'cylinder',
        body_ids: ['body:0'],
        area: { min: 10, max: 50 },
        radius: { min: 1, max: 5 },
        normal: { direction: [1, 2, 3], match: 'opposite_direction', tolerance_degrees: 7 },
        quality: { valid: false, tolerance_max: 0.02 },
      },
      include: ['basic', 'geometry'],
      summarize: { by: ['type', 'body'], stats: ['count', 'diameter'], unique: ['radius'] },
      sort: 'largest_radius',
      max_results: 12,
    });

    expect(query.where).toEqual({
      surface_type: 'cylinder',
      area_min: 10,
      area_max: 50,
      radius_min: 1,
      radius_max: 5,
      body_ids: ['body:0'],
      validity_status: 'invalid',
      tolerance_max: 0.02,
      normal: { parallel_to: [-1, -2, -3], tolerance_degrees: 7 },
    });
    expect(query.select).toEqual(
      expect.arrayContaining(['id', 'surface_type', 'area', 'radius', 'diameter']),
    );
    expect(query.group_by).toEqual(['surface_type', 'body_id']);
    expect(query.aggregate).toEqual(['count', 'min:diameter', 'max:diameter', 'avg:diameter']);
    expect(query.unique).toEqual(['radius']);
    expect(query.order_by).toEqual({ by: 'radius', direction: 'desc' });
    expect(query.limit).toBe(12);
  });

  it('maps find_edges public arguments to query fields', () => {
    const query = toFindEdgesQuery({
      file_path: 'model.step',
      filters: {
        type: 'circle',
        body_ids: ['body:0'],
        length: { min: 10, max: 50 },
        radius: { min: 1, max: 5 },
        dihedral_angle: { min_degrees: 20, max_degrees: 90 },
      },
      include: ['basic', 'geometry'],
      summarize: { by: ['type', 'body'], stats: ['count', 'length'], unique: ['diameter'] },
      sort: 'shortest',
      max_results: 12,
    });

    expect(query.where).toEqual({
      curve_type: 'circle',
      length_min: 10,
      length_max: 50,
      radius_min: 1,
      radius_max: 5,
      body_ids: ['body:0'],
      dihedral_min_deg: 20,
      dihedral_max_deg: 90,
    });
    expect(query.select).toEqual(
      expect.arrayContaining(['id', 'curve_type', 'length', 'radius', 'diameter']),
    );
    expect(query.group_by).toEqual(['curve_type', 'body_id']);
    expect(query.aggregate).toEqual(['count', 'min:length', 'max:length', 'avg:length']);
    expect(query.unique).toEqual(['diameter']);
    expect(query.order_by).toEqual({ by: 'length', direction: 'asc' });
    expect(query.limit).toBe(12);
  });

  it('maps thickness and draft helpers to measure specs', () => {
    expect(
      buildThicknessSpecs({
        file_path: 'model.step',
        faces: ['face:1'],
        direction_mode: 'normal',
        bidirectional: false,
        spacing_mm: 3,
        detail: 'samples',
      }),
    ).toEqual([
      {
        op: 'ray_test_grid',
        direction_shortcut: 'normal',
        direction: undefined,
        bidirectional: false,
        spacing_mm: 3,
        detail_level: 'points',
      },
    ]);

    expect(
      buildDraftSpecs({ file_path: 'model.step', faces: ['face:1'], pull_direction: [0, 0, 1] }),
    ).toEqual([{ op: 'draft_angle', direction_shortcut: undefined, direction: [0, 0, 1] }]);
  });

  it('maps each measure_geometry measurement type to measure specs', () => {
    expect(
      buildGeometrySpecs({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:1'],
        direction: [0, 0, 1],
        origin_mode: 'extent_center',
        max_distance: 50,
      }),
    ).toEqual([
      {
        op: 'ray_test_segment',
        origin: 'extent_center',
        direction_shortcut: undefined,
        direction: [0, 0, 1],
        tmax: 50,
      },
    ]);
    expect(
      buildGeometrySpecs({
        file_path: 'model.step',
        measurement_type: 'ray_grid',
        entity_ids: ['face:1'],
        direction_mode: 'axis',
        bidirectional: true,
        detail: 'hits',
      }),
    ).toEqual([
      {
        op: 'ray_test_grid',
        direction_shortcut: 'along_axis',
        direction: undefined,
        bidirectional: true,
        spacing_mm: undefined,
        detail_level: 'points',
      },
    ]);
    expect(
      buildGeometrySpecs({
        file_path: 'model.step',
        measurement_type: 'point_analysis',
        entity_ids: ['face:1'],
        points: [[1, 2, 3]],
        checks: ['contains_body', 'edge_projection'],
        tolerance: 0.1,
      }),
    ).toEqual([
      { op: 'contains_point', point: [1, 2, 3], tolerance: 0.1 },
      { op: 'edge_projection', point: [1, 2, 3], tolerance: 0.1 },
    ]);
    expect(
      buildGeometrySpecs({
        file_path: 'model.step',
        measurement_type: 'section',
        entity_ids: ['body:0'],
        plane_origin: [0, 0, 0],
        plane_normal: [0, 0, 1],
      }),
    ).toEqual([{ op: 'section_by_plane', plane_origin: [0, 0, 0], plane_normal: [0, 0, 1] }]);
    expect(
      buildGeometrySpecs({
        file_path: 'model.step',
        measurement_type: 'continuity',
        entity_ids: ['edge:1'],
      }),
    ).toEqual([{ op: 'continuity' }]);
  });
});
