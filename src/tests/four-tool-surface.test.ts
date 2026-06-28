import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  toolSchemas,
  ENTITIES,
  GROUP_BY_DIMENSIONS,
  MEASURE_OPS,
  PIPELINE_OPS,
} from '../schemas/tool-schemas.js';
import { toolExamples } from '../schemas/examples.js';
import { queryHelpResourceHandler, QUERY_HELP_URI } from '../resources/query-help.js';

describe('4-tool surface: schema contracts', () => {
  it('exposes the approved public schemas', () => {
    expect(Object.keys(toolSchemas).sort()).toEqual(['diff_step', 'inspect_step', 'query_step', 'transact_step']);
  });

  it('declares 9 entity types for query_step', () => {
    expect(ENTITIES).toHaveLength(9);
    expect(new Set(ENTITIES)).toEqual(
      new Set(['assembly_node', 'bodies', 'color', 'edges', 'faces', 'layer', 'material', 'pmi', 'vertices']),
    );
  });

  it('declares 10 group_by dimensions and 11 measure ops and 5 pipeline ops', () => {
    expect(GROUP_BY_DIMENSIONS).toHaveLength(10);
    expect(MEASURE_OPS).toHaveLength(11);
    expect(new Set(PIPELINE_OPS)).toEqual(
      new Set(['filter_results', 'for_each', 'query', 'select', 'walk_assembly']),
    );
  });

  it('inspect_step rejects unknown fields (strict mode)', () => {
    const schema = toolSchemas.inspect_step;
    expect(schema.safeParse({ file_path: 'model.step' }).success).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', extra: 'no' }).success).toBe(false);
  });

  it('query_step requires entities and rejects unknown fields', () => {
    const schema = toolSchemas.query_step;
    expect(schema.safeParse({ file_path: 'model.step' }).success).toBe(false);
    expect(schema.safeParse({ file_path: 'model.step', entities: 'faces' }).success).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', entities: 'face' }).success).toBe(false);
    expect(schema.safeParse({ file_path: 'model.step', entities: 'faces', unknown_field: 1 }).success).toBe(
      false,
    );
  });

  it('query_step filter is a single bag; entity-specific filter fields parse cleanly', () => {
    /* The filter is one object with the full set of conditional fields.
     * Strict mode at the schema level catches typos in field names; the
     * engine decides which fields apply to the chosen entities. */
    const schema = toolSchemas.query_step;
    /* PMI query with only PMI-applicable fields should parse */
    const pmi = schema.safeParse({
      file_path: 'model.step',
      entities: 'pmi',
      filter: { pmi_type: 'geometric_tolerance', tolerance_subtype: 'position' },
    });
    expect(pmi.success).toBe(true);
    /* Face query with only face-applicable fields should parse */
    const face = schema.safeParse({
      file_path: 'model.step',
      entities: 'faces',
      filter: { surface_type: 'cylinder', radius_min: 0.1 },
    });
    expect(face.success).toBe(true);
    /* Strict mode catches unknown field names (typo guard) */
    const bad = schema.safeParse({
      file_path: 'model.step',
      entities: 'pmi',
      filter: { pmi_typ: 'typo' },
    });
    expect(bad.success).toBe(false);
  });

  it('query_step validates aggregate format', () => {
    const schema = toolSchemas.query_step;
    const good = schema.safeParse({
      file_path: 'model.step',
      entities: 'faces',
      aggregate: ['min:area', 'max:radius', 'count:hit_distance', 'count'],
    });
    expect(good.success).toBe(true);
    const bad = schema.safeParse({
      file_path: 'model.step',
      entities: 'faces',
      aggregate: ['not_a_format'],
    });
    expect(bad.success).toBe(false);
  });

  it('query_step validates measure ops', () => {
    const schema = toolSchemas.query_step;
    const good = schema.safeParse({
      file_path: 'model.step',
      entities: 'faces',
      measure: [{ op: 'ray_test', direction: [0, 0, 1] }],
    });
    expect(good.success).toBe(true);
    const bad = schema.safeParse({
      file_path: 'model.step',
      entities: 'faces',
      measure: [{ op: 'not_an_op' }],
    });
    expect(bad.success).toBe(false);
  });

  it('diff_step requires both file paths', () => {
    const schema = toolSchemas.diff_step;
    expect(
      schema.safeParse({ baseline_file_path: 'a.step', comparison_file_path: 'b.step' }).success,
    ).toBe(true);
    expect(schema.safeParse({ baseline_file_path: 'a.step' }).success).toBe(false);
    expect(schema.safeParse({ comparison_file_path: 'b.step' }).success).toBe(false);
  });

  it('transact_step requires non-empty pipeline', () => {
    const schema = toolSchemas.transact_step;
    expect(schema.safeParse({ file_path: 'm.step', pipeline: [] }).success).toBe(false);
    expect(
      schema.safeParse({
        file_path: 'm.step',
        pipeline: [{ op: 'query', params: { entities: 'faces' } }],
      }).success,
    ).toBe(true);
  });

  it('transact_step validates pipeline op enum', () => {
    const schema = toolSchemas.transact_step;
    const bad = schema.safeParse({
      file_path: 'm.step',
      pipeline: [{ op: 'not_a_pipeline_op' }],
    });
    expect(bad.success).toBe(false);
  });
});

describe('4-tool surface: input_examples coverage', () => {
  it('query_step has 6 examples covering minimal/partial/full styles', () => {
    expect(toolExamples.query_step).toHaveLength(6);
    /* minimal: just required fields */
    expect(Object.keys(toolExamples.query_step[0]).sort()).toEqual(['entities', 'entity_ids', 'file_path']);
    /* full: filter + sort + limit + select */
    const full = toolExamples.query_step[1] as Record<string, unknown>;
    expect(full.filter).toBeDefined();
    expect(full.sort).toBeDefined();
    expect(full.select).toBeDefined();
    /* group_by example */
    const groupBy = toolExamples.query_step[2] as Record<string, unknown>;
    expect(groupBy.group_by).toEqual(['axis']);
    /* measure + aggregate example */
    const measure = toolExamples.query_step[3] as Record<string, unknown>;
    expect(measure.measure).toBeDefined();
    expect(measure.aggregate).toBeDefined();
    /* XDE example (PMI with linked_to) */
    const pmi = toolExamples.query_step[5] as Record<string, unknown>;
    expect(pmi.entities).toBe('pmi');
    expect((pmi.filter as Record<string, unknown>).linked_to).toBeDefined();
  });

  it('transact_step has 4 examples covering minimal/full styles', () => {
    expect(toolExamples.transact_step).toHaveLength(4);
    /* minimal: single query step */
    const minimal = toolExamples.transact_step[0] as Record<string, unknown>;
    expect(minimal.pipeline).toHaveLength(1);
    /* full: blind holes pipeline */
    const blind = toolExamples.transact_step[1] as Record<string, unknown>;
    expect(blind.pipeline).toHaveLength(4);
    /* XDE walk example */
    const walk = toolExamples.transact_step[2] as Record<string, unknown>;
    const firstStep = (walk.pipeline as Array<Record<string, unknown>>)[0];
    expect(firstStep.op).toBe('walk_assembly');
  });

  it('inspect_step and diff_step each have 1 minimal example', () => {
    expect(toolExamples.inspect_step).toHaveLength(1);
    expect(toolExamples.diff_step).toHaveLength(1);
  });
});

describe('query_help resource', () => {
  it('returns valid JSON with the surface reference', () => {
    const result = queryHelpResourceHandler();
    expect(result.uri).toBe(QUERY_HELP_URI);
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    expect(parsed.surface).toBe('4-tool');
    expect((parsed.tools as Record<string, unknown>).query_step).toBeDefined();
    expect((parsed.tools as Record<string, unknown>).inspect_step).toBeDefined();
    expect((parsed.tools as Record<string, unknown>).diff_step).toBeDefined();
    expect((parsed.tools as Record<string, unknown>).transact_step).toBeDefined();
  });

  it('documents the migration from the 9-tool surface', () => {
    const result = queryHelpResourceHandler();
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    const migration = parsed.migration_from_9_tool_surface as Record<string, string>;
    expect(migration.find_step_faces).toBeDefined();
    expect(migration.find_coaxial_cylinders).toBeDefined();
    expect(migration.compare_step_files).toBeDefined();
    expect(migration.find_step_faces).toContain('query_step');
    expect(migration.find_coaxial_cylinders).toContain('group_by');
  });
});

describe('zod schema registration sanity', () => {
  it('every schema in toolSchemas is a Zod object schema with .shape', () => {
    for (const [name, schema] of Object.entries(toolSchemas)) {
      expect(schema, name).toBeInstanceOf(z.ZodType);
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      expect(shape, name).toBeDefined();
    }
  });
});
