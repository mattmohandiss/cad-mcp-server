import { describe, expect, it } from 'vitest';
import { queryHelpResourceHandler } from '../resources/query-help.js';
import { schema as diffStepSchema } from '../tools/diff.js';
import { schema as findEdgesSchema } from '../tools/find-edges.js';
import { schema as findFacesSchema } from '../tools/find-faces.js';
import { schema as inspectStepSchema } from '../tools/inspect.js';
import { schema as measureDistanceSchema } from '../tools/measure-distance.js';
import { schema as measureDraftSchema } from '../tools/measure-draft.js';
import { schema as measureGeometrySchema } from '../tools/measure-geometry.js';
import { schema as measureThicknessSchema } from '../tools/measure-thickness.js';
import { PUBLIC_TOOL_NAMES, TOOL_REGISTRY } from '../tools/registry.js';

describe('tool contracts', () => {
  it('registry tool names are unique', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps query-help aligned with the public tool surface', () => {
    const help = JSON.parse(queryHelpResourceHandler().text) as { tools: Record<string, unknown> };
    expect(Object.keys(help.tools)).toEqual(PUBLIC_TOOL_NAMES);
  });

  it('parses every public example', () => {
    for (const tool of TOOL_REGISTRY) {
      for (const example of tool.examples) {
        const result = tool.schema.safeParse(example);
        expect(
          result.success,
          `${tool.name} example should parse: ${JSON.stringify(example)}`,
        ).toBe(true);
      }
    }
  });

  it('rejects unknown top-level fields', () => {
    expect(inspectStepSchema.safeParse({ file_path: 'model.step', extra: true }).success).toBe(
      false,
    );
    expect(
      diffStepSchema.safeParse({
        baseline_file_path: 'a.step',
        comparison_file_path: 'b.step',
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('accepts one representative request for each public parameter family', () => {
    expect(
      findFacesSchema.safeParse({
        file_path: 'model.step',
        filters: {
          type: 'cylinder',
          body_ids: ['body:0'],
          area: { min: 10, max: 100 },
          radius: { min: 1, max: 5 },
          normal: { direction: [0, 0, 1], match: 'parallel', tolerance_degrees: 5 },
          quality: { valid: true, tolerance_max: 0.01 },
        },
        include: ['basic', 'geometry', 'adjacency', 'topology', 'quality'],
        summarize: { by: ['type', 'axis'], stats: ['count', 'area'], unique: ['diameter'] },
        sort: 'smallest_radius',
        max_results: 25,
      }).success,
    ).toBe(true);

    expect(
      findEdgesSchema.safeParse({
        file_path: 'model.step',
        filters: {
          type: 'circle',
          body_ids: ['body:0'],
          length: { min: 10, max: 100 },
          radius: { min: 1, max: 5 },
          dihedral_angle: { min_degrees: 15, max_degrees: 120 },
        },
        include: ['basic', 'geometry', 'adjacency', 'topology', 'quality'],
        summarize: { by: ['type', 'body'], stats: ['count', 'length'], unique: ['radius'] },
        sort: 'longest',
        max_results: 25,
      }).success,
    ).toBe(true);

    expect(
      measureDistanceSchema.safeParse({
        file_path: 'model.step',
        sources: ['face:1'],
        targets: ['edge:2'],
        summary: 'minimum',
        include_extrema: true,
      }).success,
    ).toBe(true);
  });

  it('enforces conditional and mutually exclusive fields', () => {
    expect(
      measureDistanceSchema.safeParse({ file_path: 'model.step', sources: ['face:1'] }).success,
    ).toBe(false);
    expect(
      measureThicknessSchema.safeParse({
        file_path: 'model.step',
        faces: ['face:1'],
        direction: [0, 0, 1],
        direction_mode: 'normal',
      }).success,
    ).toBe(false);
    expect(
      measureDraftSchema.safeParse({
        file_path: 'model.step',
        faces: ['face:1'],
        pull_direction: [0, 0, 1],
        pull_direction_mode: 'normal',
      }).success,
    ).toBe(false);
    expect(
      measureGeometrySchema.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:1'],
      }).success,
    ).toBe(false);
    expect(
      measureGeometrySchema.safeParse({
        file_path: 'model.step',
        measurement_type: 'section',
        entity_ids: ['body:0'],
      }).success,
    ).toBe(false);
    expect(
      measureGeometrySchema.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:1'],
        direction: [0, 0, 1],
        direction_mode: 'normal',
      }).success,
    ).toBe(false);
    expect(
      measureGeometrySchema.safeParse({
        file_path: 'model.step',
        measurement_type: 'ray',
        entity_ids: ['face:1'],
        direction: [0, 0, 1],
        origin: [0, 0, 0],
        origin_mode: 'extent_center',
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported fields instead of accepting ignored options', () => {
    expect(
      findEdgesSchema.safeParse({
        file_path: 'model.step',
        summarize: { by: ['feature'] },
      }).success,
    ).toBe(false);
    expect(
      measureGeometrySchema.safeParse({
        file_path: 'model.step',
        measurement_type: 'section',
        entity_ids: ['body:0'],
        plane_origin: [0, 0, 0],
        plane_normal: [0, 0, 1],
        analyze: 'edge_count',
      }).success,
    ).toBe(false);
  });
});
