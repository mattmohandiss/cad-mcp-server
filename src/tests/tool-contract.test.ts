import { describe, expect, it } from 'vitest';
import { queryHelpResourceHandler } from '../resources/query-help.js';
import { schema as diffSchema } from '../tools/diff.js';
import { schema as findEntitiesSchema } from '../tools/find-entities.js';
import { schema as inspectSchema } from '../tools/inspect.js';
import { schema as measureSchema } from '../tools/measure.js';
import * as outputSchemas from '../output-schemas.js';
import { PUBLIC_TOOL_NAMES, TOOL_REGISTRY } from '../tools/registry.js';

const artifact = {
  revision: `sha256:${'0'.repeat(64)}`,
  uri: 'file:///work/model.step',
  format: 'step',
  units: 'mm',
};

describe('tool contracts', () => {
  it('advertises a unique output schema for each public tool', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(TOOL_REGISTRY.every((tool) => tool.outputSchema)).toBe(true);
    expect(PUBLIC_TOOL_NAMES.sort()).toEqual(
      ['diff', 'find_entities', 'inspect', 'measure'].sort(),
    );
  });

  it('keeps query help aligned with the public surface', () => {
    const help = JSON.parse(queryHelpResourceHandler().text) as {
      tools: Record<string, unknown>;
      surface: string;
      rules: string[];
    };
    expect(Object.keys(help.tools).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
    expect(help.surface).toContain('4 read-only tools');
    expect(help.rules.join(' ')).toContain('artifact revision and id scheme');
    expect(help).not.toHaveProperty('prompts');
  });

  it('accepts v1 artifact inputs and rejects bare paths or unknown fields', () => {
    expect(inspectSchema.safeParse({ uri: artifact.uri }).success).toBe(true);
    expect(inspectSchema.safeParse({ file_path: 'model.step' }).success).toBe(false);
    expect(inspectSchema.safeParse({ uri: artifact.uri, extra: true }).success).toBe(false);
    expect(
      findEntitiesSchema.safeParse({ artifact, entity_type: 'face', surface_type: 'plane' })
        .success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        artifact,
        kind: 'distance',
        sources: ['face:1'],
        targets: ['face:2'],
      }).success,
    ).toBe(true);
    expect(
      diffSchema.safeParse({ baseline: { uri: artifact.uri }, candidate: { uri: artifact.uri } })
        .success,
    ).toBe(true);
  });

  it('parses every public example', () => {
    for (const tool of TOOL_REGISTRY) {
      for (const example of tool.examples) {
        expect(
          tool.schema.safeParse(example).success,
          `${tool.name}: ${JSON.stringify(example)}`,
        ).toBe(true);
      }
    }
  });

  it('requires artifact identity in every geometry result', () => {
    const coordinate_frame = {
      id: 'step-model',
      origin: [0, 0, 0],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      handedness: 'right',
      units: 'mm',
    };
    expect(outputSchemas.inspect.safeParse({ artifact, coordinate_frame }).success).toBe(true);
    expect(
      outputSchemas.query.safeParse({
        artifact,
        entity_id_scheme: { authority: 'cad-mcp-server', idScheme: 'occt-topology-v1' },
        coordinate_frame,
        units: { length: 'mm', area: 'mm2', volume: 'mm3', angle: 'deg' },
        query: {},
        statistics: {},
        pagination: { limit: 10, offset: 0, returned: 1, total_matched: 1, has_more: false },
        entities: [{ id: 'face:1' }],
        groups: [],
      }).success,
    ).toBe(true);
    expect(
      outputSchemas.diff.safeParse({
        inputs: [
          { role: 'baseline', artifact },
          { role: 'candidate', artifact },
        ],
        units: { length: 'mm', area: 'mm2', volume: 'mm3' },
        deltas: {},
        providers: {},
      }).success,
    ).toBe(true);
    expect(
      outputSchemas.measure.safeParse({
        artifact,
        entity_id_scheme: { authority: 'cad-mcp-server', idScheme: 'occt-topology-v1' },
        coordinate_frame,
        subjects: [
          {
            type: 'geometry',
            artifact,
            entity: {
              authority: 'cad-mcp-server',
              idScheme: 'occt-topology-v1',
              id: 'face:1',
              kind: 'face',
            },
          },
        ],
        kind: 'thickness',
        units: { length: 'mm' },
        entity_count: 1,
        results: [{ entity_id: 'face:1' }],
      }).success,
    ).toBe(true);
    expect(
      outputSchemas.measure.safeParse({ artifact, kind: 'thickness', results: [] }).success,
    ).toBe(false);
  });
});
