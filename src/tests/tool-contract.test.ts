import { describe, expect, it } from 'vitest';
import { queryHelpResourceHandler } from '../resources/query-help.js';
import { schema as diffSchema } from '../tools/diff.js';
import { schema as findEntitiesSchema } from '../tools/find-entities.js';
import { schema as inspectSchema } from '../tools/inspect.js';
import { schema as measureSchema } from '../tools/measure.js';
import * as outputSchemas from '../output-schemas.js';
import { PUBLIC_TOOL_NAMES, TOOL_REGISTRY } from '../tools/registry.js';

describe('tool contracts', () => {
  it('registry tool names are unique', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('advertises an output schema for every public tool', () => {
    expect(TOOL_REGISTRY.every((tool) => tool.outputSchema)).toBe(true);
  });

  it('exposes exactly the 4-tool public surface', () => {
    expect(PUBLIC_TOOL_NAMES.sort()).toEqual(
      ['diff', 'find_entities', 'inspect', 'measure'].sort(),
    );
  });

  it('keeps query-help aligned with the public tool surface', () => {
    const help = JSON.parse(queryHelpResourceHandler().text) as {
      tools: Record<string, unknown>;
      surface: string;
      rules: string[];
    };
    expect(Object.keys(help.tools).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
    expect(help.surface).toContain('4 read-only tools');
    expect(help.rules.join(' ')).toContain('component:RepeatedPart#0/body:0');
    expect(help).not.toHaveProperty('prompts');
  });

  it('documents the inspect output returned by the handler', () => {
    expect(
      outputSchemas.inspect.safeParse({
        file_path: 'model.step',
        size: {
          bounding_box: { min: [0, 0, 0], max: [1, 2, 3] },
          dimensions: { width: 1, height: 2, depth: 3 },
          volume: 6,
          surface_area: 22,
          units: 'mm',
        },
        structure: {
          body_count: 1,
          is_assembly: true,
          component_occurrences: ['RepeatedPart#0', 'RepeatedPart#1'],
        },
        health: {
          is_valid: true,
          complexity: { body_count: 1, face_count: 6, edge_count: 12 },
        },
      }).success,
    ).toBe(true);
  });

  it('parses every public example', () => {
    for (const tool of TOOL_REGISTRY) {
      for (const example of tool.examples) {
        const result = tool.schema.safeParse(example);
        expect(
          result.success,
          tool.name + ' example should parse: ' + JSON.stringify(example),
        ).toBe(true);
      }
    }
  });

  it('rejects unknown top-level fields', () => {
    expect(inspectSchema.safeParse({ file_path: 'model.step', extra: true }).success).toBe(false);
    expect(
      diffSchema.safeParse({ file_path_a: 'a.step', file_path_b: 'b.step', extra: true }).success,
    ).toBe(false);
  });

  it('accepts representative face, edge, and distance requests', () => {
    expect(
      findEntitiesSchema.safeParse({
        file_path: 'model.step',
        entity_type: 'face',
        surface_type: 'plane',
        min_area: 10,
        limit: 25,
      }).success,
    ).toBe(true);
    expect(
      findEntitiesSchema.safeParse({
        file_path: 'model.step',
        entity_type: 'edge',
        curve_type: 'circle',
        min_length: 10,
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        file_path: 'model.step',
        kind: 'distance',
        sources: ['face:1'],
        targets: ['edge:2'],
        summary: 'minimum',
      }).success,
    ).toBe(true);
  });

  it('rejects unsupported fields and invalid required measure inputs', () => {
    expect(
      findEntitiesSchema.safeParse({ file_path: 'm.step', entity_type: 'face', min_length: 5 })
        .success,
    ).toBe(false);
    expect(
      findEntitiesSchema.safeParse({ file_path: 'm.step', entity_type: 'face', bogus: 1 }).success,
    ).toBe(false);
    expect(
      measureSchema.safeParse({ file_path: 'm.step', kind: 'thickness', entity_ids: ['face:0'] })
        .success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({ file_path: 'm.step', kind: 'ray', entity_ids: ['face:0'] }).success,
    ).toBe(false);
    expect(
      measureSchema.safeParse({ file_path: 'm.step', kind: 'distance', sources: ['face:0'] })
        .success,
    ).toBe(false);
  });
});
