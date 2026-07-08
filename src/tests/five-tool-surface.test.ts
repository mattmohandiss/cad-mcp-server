import { describe, expect, it } from 'vitest';
import { schema as inspectStepSchema, examples as inspectExamples } from '../tools/inspect.js';
import { schema as findFacesSchema, examples as findFacesExamples } from '../tools/find-faces.js';
import { schema as findEdgesSchema, examples as findEdgesExamples } from '../tools/find-edges.js';
import {
  schema as measureDistanceSchema,
  examples as measureDistanceExamples,
} from '../tools/measure-distance.js';
import {
  schema as measureThicknessSchema,
  examples as measureThicknessExamples,
} from '../tools/measure-thickness.js';
import {
  schema as measureDraftSchema,
  examples as measureDraftExamples,
} from '../tools/measure-draft.js';
import {
  schema as measureGeometrySchema,
  examples as measureGeometryExamples,
} from '../tools/measure-geometry.js';
import { schema as diffStepSchema, examples as diffExamples } from '../tools/diff.js';
import { PUBLIC_TOOL_NAMES } from '../tool-defs.js';
import { queryHelpResourceHandler } from '../resources/query-help.js';

const toolSchemas = {
  inspect_step: inspectStepSchema,
  find_faces: findFacesSchema,
  find_edges: findEdgesSchema,
  measure_distance: measureDistanceSchema,
  measure_thickness: measureThicknessSchema,
  measure_draft: measureDraftSchema,
  measure_geometry: measureGeometrySchema,
  diff_step: diffStepSchema,
} as const;

const toolExamples = {
  inspect_step: inspectExamples,
  find_faces: findFacesExamples,
  find_edges: findEdgesExamples,
  measure_distance: measureDistanceExamples,
  measure_thickness: measureThicknessExamples,
  measure_draft: measureDraftExamples,
  measure_geometry: measureGeometryExamples,
  diff_step: diffExamples,
} as const;

describe('8-tool surface: schema contracts', () => {
  it('exposes the approved public schemas', () => {
    expect(Object.keys(toolSchemas)).toEqual(PUBLIC_TOOL_NAMES);
  });

  it('inspect_step accepts include presets', () => {
    expect(toolSchemas.inspect_step.safeParse({ file_path: 'model.step' }).success).toBe(true);
    expect(
      toolSchemas.inspect_step.safeParse({
        file_path: 'model.step',
        include: ['size', 'counts', 'health', 'bodies'],
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.inspect_step.safeParse({ file_path: 'model.step', extra: 'no' }).success,
    ).toBe(false);
  });

  it('find_faces accepts task-oriented filters', () => {
    expect(
      toolSchemas.find_faces.safeParse({
        file_path: 'model.step',
        filters: { type: 'cylinder', radius: { min: 2.5, max: 10 } },
        include: ['basic', 'geometry'],
        sort: 'smallest_radius',
      }).success,
    ).toBe(true);
  });

  it('find_edges accepts task-oriented filters', () => {
    expect(
      toolSchemas.find_edges.safeParse({
        file_path: 'model.step',
        filters: { type: 'circle', radius: { min: 1 }, length: { min: 10 } },
        include: ['basic', 'geometry'],
      }).success,
    ).toBe(true);
  });

  it('measure_distance accepts set-based sources/targets', () => {
    expect(
      toolSchemas.measure_distance.safeParse({
        file_path: 'model.step',
        sources: ['face:2', 'face:3'],
        targets: ['face:0', 'face:5'],
        summary: 'minimum',
      }).success,
    ).toBe(true);
  });

  it('measure_distance accepts legacy entity_ids + target_entity_id', () => {
    expect(
      toolSchemas.measure_distance.safeParse({
        file_path: 'model.step',
        entity_ids: ['face:6'],
        target_entity_id: 'edge:0',
      }).success,
    ).toBe(true);
  });

  it('measure_distance rejects missing targets when sources present', () => {
    expect(
      toolSchemas.measure_distance.safeParse({
        file_path: 'model.step',
        sources: ['face:6'],
      }).success,
    ).toBe(false);
  });

  it('measure_thickness accepts flat schema', () => {
    expect(
      toolSchemas.measure_thickness.safeParse({
        file_path: 'model.step',
        faces: ['face:6', 'face:7'],
        direction_mode: 'normal',
        bidirectional: true,
      }).success,
    ).toBe(true);
  });

  it('measure_draft accepts flat schema', () => {
    expect(
      toolSchemas.measure_draft.safeParse({
        file_path: 'model.step',
        faces: ['face:1', 'face:2'],
        pull_direction: [0, 0, 1],
      }).success,
    ).toBe(true);
  });

  it('measure_geometry accepts flat enum discriminator', () => {
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:7'],
        direction: [0, 0, 1],
        origin_mode: 'extent_center',
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray_grid',
        entity_ids: ['face:6'],
        direction_mode: 'normal',
        spacing_mm: 2,
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'section',
        entity_ids: ['body:0'],
        plane_origin: [0, 0, 0],
        plane_normal: [1, 0, 0],
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'continuity',
        entity_ids: ['edge:5'],
      }).success,
    ).toBe(true);
  });

  it('measure_geometry rejects missing required fields per type', () => {
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:7'],
      }).success,
    ).toBe(false);
    expect(
      toolSchemas.measure_geometry.safeParse({
        file_path: 'model.step',
        measurement_type: 'section',
        entity_ids: ['body:0'],
      }).success,
    ).toBe(false);
  });

  it('diff_step rejects unknown fields', () => {
    expect(
      toolSchemas.diff_step.safeParse({
        baseline_file_path: 'a.step',
        comparison_file_path: 'b.step',
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.diff_step.safeParse({
        baseline_file_path: 'a.step',
        comparison_file_path: 'b.step',
        extra: 'no',
      }).success,
    ).toBe(false);
  });

  it('every public example parses successfully', () => {
    for (const name of Object.keys(toolSchemas) as (keyof typeof toolSchemas)[]) {
      for (const ex of toolExamples[name]) {
        const result = toolSchemas[name].safeParse(ex);
        if (!result.success) console.error(`Invalid ${name} example:`, ex, result.error.issues);
        expect(result.success).toBe(true);
      }
    }
  });

  it('query-help describes the public tool surface', () => {
    const help = JSON.parse(queryHelpResourceHandler().text) as {
      tools: Record<string, unknown>;
    };

    expect(Object.keys(help.tools)).toEqual(PUBLIC_TOOL_NAMES);
  });
});
