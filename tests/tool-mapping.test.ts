import { describe, expect, it } from 'vitest';
import { schema as findEntitiesSchema } from '../src/tools/find-entities.js';
import { filterInspectResult, type InspectResult } from '../src/tools/inspect.js';
import { schema as measureSchema } from '../src/tools/measure.js';
import { STEP_MODEL_FRAME } from '../src/domain/artifact-reference.js';

const artifact = {
  revision: `sha256:${'0'.repeat(64)}`,
  uri: 'file:///work/model.step',
  format: 'step' as const,
  units: 'mm' as const,
};

describe('four-tool artifact surface', () => {
  it('filters inspect output while retaining artifact identity', () => {
    const input: InspectResult = {
      artifact,
      coordinate_frame: STEP_MODEL_FRAME,
      size: {
        bounding_box: { min: [0, 0, 0], max: [1, 2, 3] },
        dimensions: { width: 1, height: 2, depth: 3 },
        volume: 6,
        surface_area: 22,
        units: { length: 'mm', area: 'mm2', volume: 'mm3' },
      },
      structure: { body_count: 1, is_assembly: false, component_occurrences: [] },
      health: {
        is_valid: true,
        complexity: { body_count: 1, face_count: 6, edge_count: 12 },
      },
    };
    expect(filterInspectResult(input, new Set(['size', 'health']))).toEqual(input);
  });

  it('validates face, edge, vertex, and body queries with one revision-bound artifact', () => {
    for (const query of [
      { entity_type: 'face', component_name: 'wheel', surface_type: 'cylinder', min_area: 10 },
      { entity_type: 'edge', curve_type: 'circle', min_length: 5 },
      { entity_type: 'vertex' },
      { entity_type: 'body' },
    ]) {
      expect(findEntitiesSchema.safeParse({ artifact, ...query }).success).toBe(true);
    }
    expect(
      findEntitiesSchema.safeParse({ artifact, entity_type: 'face', curve_type: 'circle' }).success,
    ).toBe(false);
    expect(
      findEntitiesSchema.safeParse({ artifact, entity_type: 'face', entity_ids: [] }).success,
    ).toBe(false);
  });

  it('validates every measurement kind and rejects missing or invalid inputs', () => {
    const cases = [
      { kind: 'distance', sources: ['component:wheel#0/face:0'], targets: ['face:1'] },
      { kind: 'thickness', entity_ids: ['face:0'] },
      { kind: 'draft', entity_ids: ['face:0'], pull_direction: [0, 0, 1] },
      { kind: 'ray', entity_ids: ['face:0'], direction: [0, 0, 1] },
      { kind: 'ray_grid', entity_ids: ['face:0'], direction: [0, 0, 1] },
      {
        kind: 'point_analysis',
        entity_ids: ['face:0'],
        points: [[0, 0, 0]],
        checks: ['classify_face'],
      },
      { kind: 'section', entity_ids: ['body:0'], plane_origin: [0, 0, 0], plane_normal: [1, 0, 0] },
      { kind: 'continuity', entity_ids: ['edge:0'] },
    ];
    for (const args of cases)
      expect(measureSchema.safeParse({ artifact, ...args }).success).toBe(true);
    expect(
      measureSchema.safeParse({ artifact, kind: 'distance', sources: [], targets: ['face:1'] })
        .success,
    ).toBe(false);
    expect(measureSchema.safeParse({ artifact, kind: 'ray', entity_ids: ['face:0'] }).success).toBe(
      false,
    );
  });
});
