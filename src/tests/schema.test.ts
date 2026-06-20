import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { stepToolSchemas } from '../tools/step-tools.js';

const filePath = '/tmp/model.step';

describe('public tool schema contract', () => {
  it('defines the approved public STEP tool schemas', () => {
    expect(Object.keys(stepToolSchemas).sort()).toEqual([
      'compareStepFiles',
      'findStepEdges',
      'findStepFaces',
      'getStepEntities',
      'inspectStepFile',
      'queryStepPmi',
    ]);
  });

  it('accepts face find arguments and rejects ID/legacy fields', () => {
    const schema = z.object(stepToolSchemas.findStepFaces).strict();

    expect(
      schema.safeParse({
        file_path: filePath,
        body_ids: ['body:0'],
        surface_types: ['plane', 'cylinder'],
        area_min: 1,
        area_max: 100,
        normal_parallel_to: [0, 0, 1],
        bbox_min: [0, 0, 0],
        bbox_max: [10, 10, 10],
        center_near_point: [5, 5, 5],
        center_near_distance: 2,
        fields: ['id', 'surface_type', 'bbox_center', 'adjacent_faces'],
        group_by: ['surface_type'],
        sort_by: 'area',
        sort_direction: 'desc',
        return_type: 'groups',
        limit: 10,
        offset: 0,
        sample_entity_limit: 5,
      }).success
    ).toBe(true);

    for (const invalid of [
      { face_ids: ['face:0'] },
      { filter: { surface_type: ['plane'] } },
      { region: { bbox: { min: [0, 0, 0], max: [1, 1, 1] } } },
      { near: { point: [0, 0, 0], distance: 1 } },
      { include: ['id'] },
      { result_mode: 'entities' },
      { bbox_match: 'intersects_bbox' },
      { normal_tolerance_degrees: 5 },
    ]) {
      expect(schema.safeParse({ file_path: filePath, ...invalid }).success).toBe(false);
    }
  });

  it('rejects removed fields in edge find schema', () => {
    const schema = z.object(stepToolSchemas.findStepEdges).strict();
    expect(schema.safeParse({ file_path: filePath, bbox_match: 'intersects_bbox' }).success).toBe(
      false
    );
  });

  it('accepts edge find arguments and rejects ID/invalid values', () => {
    const schema = z.object(stepToolSchemas.findStepEdges).strict();

    expect(
      schema.safeParse({
        file_path: filePath,
        curve_types: ['line'],
        length_max: 1,
        radius_min: 2,
        fields: ['id', 'curve_type', 'bbox_center'],
        group_by: ['curve_type', 'length_range'],
        sort_by: 'length',
        sort_direction: 'asc',
        return_type: 'entities',
      }).success
    ).toBe(true);

    expect(schema.safeParse({ file_path: filePath, edge_ids: ['edge:0'] }).success).toBe(false);
    expect(schema.safeParse({ file_path: filePath, fields: ['length', 'length'] }).success).toBe(
      false
    );
    expect(schema.safeParse({ file_path: filePath, fields: [] }).success).toBe(false);
    expect(schema.safeParse({ file_path: filePath, group_by: ['axis_direction'] }).success).toBe(
      false
    );
    expect(schema.safeParse({ file_path: filePath, sample_entity_limit: 51 }).success).toBe(false);
  });

  it('accepts get entity, PMI, and compare arguments', () => {
    const getSchema = z.object(stepToolSchemas.getStepEntities).strict();
    const pmiSchema = z.object(stepToolSchemas.queryStepPmi).strict();
    const compareSchema = z.object(stepToolSchemas.compareStepFiles).strict();

    expect(
      getSchema.safeParse({
        file_path: filePath,
        entity_type: 'face',
        entity_ids: ['face:0'],
        fields: ['id', 'area', 'bbox_center'],
      }).success
    ).toBe(true);

    expect(
      pmiSchema.safeParse({
        file_path: filePath,
        pmi_types: ['geometric_tolerance'],
        tolerance_subtypes: ['position'],
        value_max: 0.2,
        group_by: ['type', 'tolerance_type'],
        sort_by: 'value',
        return_type: 'groups',
      }).success
    ).toBe(true);

    expect(
      compareSchema.safeParse({
        baseline_file_path: '/tmp/a.step',
        comparison_file_path: '/tmp/b.step',
      }).success
    ).toBe(true);

    expect(compareSchema.safeParse({ file_a: '/tmp/a.step', file_b: '/tmp/b.step' }).success).toBe(
      false
    );
  });
});
