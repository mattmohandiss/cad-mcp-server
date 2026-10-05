import { describe, expect, it } from 'vitest';
import { schema as findEntitiesSchema } from '../tools/find-entities.js';
import { filterInspectResult } from '../tools/inspect.js';
import { schema as measureSchema } from '../tools/measure.js';

describe('four-tool sidecar surface', () => {
  it('filters inspect output to requested sections', () => {
    expect(
      filterInspectResult(
        {
          file_path: 'model.step',
          size: { units: 'mm' },
          structure: { face_count: 2 },
          health: { valid: true },
        },
        new Set(['size', 'health']),
      ),
    ).toEqual({
      file_path: 'model.step',
      size: { units: 'mm' },
      structure: { face_count: 2 },
      health: { valid: true },
    });
  });
  it('validates face and edge filters as separate query shapes', () => {
    expect(
      findEntitiesSchema.safeParse({
        file_path: 'm.step',
        entity_type: 'face',
        component_name: 'wheel',
        surface_type: 'cylinder',
        min_area: 10,
      }).success,
    ).toBe(true);
    expect(
      findEntitiesSchema.safeParse({
        file_path: 'm.step',
        entity_type: 'edge',
        curve_type: 'circle',
        min_length: 5,
      }).success,
    ).toBe(true);
    expect(
      findEntitiesSchema.safeParse({ file_path: 'm.step', entity_type: 'vertex' }).success,
    ).toBe(true);
    expect(findEntitiesSchema.safeParse({ file_path: 'm.step', entity_type: 'body' }).success).toBe(
      true,
    );
    expect(
      findEntitiesSchema.safeParse({
        file_path: 'm.step',
        entity_type: 'face',
        curve_type: 'circle',
      }).success,
    ).toBe(false);
    expect(
      findEntitiesSchema.safeParse({ file_path: 'm.step', entity_type: 'face', entity_ids: [] })
        .success,
    ).toBe(false);
  });
  it('validates the eight measurement kinds and caps distance pairs', () => {
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'distance',
        sources: ['component:wheel#0/face:0'],
        targets: ['component:wheel#1/face:1'],
        summary: 'minimum',
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'distance',
        sources: [],
        targets: ['face:1'],
      }).success,
    ).toBe(false);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'thickness',
        entity_ids: ['face:0'],
        direction_mode: 'normal',
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'draft',
        entity_ids: ['face:0'],
        pull_direction: [0, 0, 1],
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'ray',
        entity_ids: ['face:0'],
        direction: [0, 0, 1],
        max_distance: 50,
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'ray_grid',
        entity_ids: ['face:0'],
        direction: [0, 0, 1],
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'point_analysis',
        entity_ids: ['face:0'],
        points: [[0, 0, 0]],
        checks: ['classify_face', 'surface_curvature'],
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'm.step',
        kind: 'section',
        entity_ids: ['body:0'],
        plane_origin: [0, 0, 0],
        plane_normal: [1, 0, 0],
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({ file_path: 'm.step', kind: 'continuity', entity_ids: ['edge:0'] })
        .success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({ file_path: 'm.step', kind: 'draft', entity_ids: ['face:0'] })
        .success,
    ).toBe(false);
  });
});
