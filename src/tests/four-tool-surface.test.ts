import { describe, expect, it } from 'vitest';
import { toolSchemas, MEASURE_OPS } from '../schemas/tool-schemas.js';
import { toolExamples } from '../schemas/examples.js';
import {
  EDGE_GROUP_BY_FIELDS,
  EDGE_ORDER_FIELDS,
  EDGE_SELECT_FIELDS,
  EDGE_WHERE_FIELDS,
  FACE_GROUP_BY_FIELDS,
  FACE_ORDER_FIELDS,
  FACE_SELECT_FIELDS,
  FACE_WHERE_FIELDS,
  PUBLIC_TOOL_NAMES,
} from '../public-contract.js';
import { queryHelpResourceHandler } from '../resources/query-help.js';

describe('5-tool surface: schema contracts', () => {
  it('exposes the approved public schemas', () => {
    expect(Object.keys(toolSchemas)).toEqual(PUBLIC_TOOL_NAMES);
  });

  it('declares the public measure ops', () => {
    expect(MEASURE_OPS).toHaveLength(13);
  });

  it('inspect_step rejects unknown fields (strict mode)', () => {
    const schema = toolSchemas.inspect_step;
    expect(schema.safeParse({ file_path: 'model.step' }).success).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', extra: 'no' }).success).toBe(false);
  });

  it('query_faces accepts valid surface_type filter', () => {
    const schema = toolSchemas.query_faces;
    expect(schema.safeParse({ file_path: 'model.step', surface_type: 'cylinder' }).success).toBe(
      true,
    );
    expect(schema.safeParse({ file_path: 'model.step', surface_type: 'invalid' }).success).toBe(
      false,
    );
  });

  it('query_faces rejects face-irrelevant fields (strict mode)', () => {
    const schema = toolSchemas.query_faces;
    expect(schema.safeParse({ file_path: 'model.step', curve_type: 'circle' }).success).toBe(false);
  });

  it('query_faces accepts radius range filter', () => {
    const schema = toolSchemas.query_faces;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        surface_type: 'cylinder',
        radius_min: 2.5,
        radius_max: 10,
      }).success,
    ).toBe(true);
  });

  it('query_faces group_by accepts face-relevant dimensions', () => {
    const schema = toolSchemas.query_faces;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        group_by: ['axis'],
        return_type: 'groups',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        file_path: 'model.step',
        group_by: ['surface_type', 'area_range'],
        return_type: 'groups',
      }).success,
    ).toBe(true);
  });

  it('query_faces rejects unknown select and order fields', () => {
    const schema = toolSchemas.query_faces;
    expect(schema.safeParse({ file_path: 'model.step', select: ['radius'] }).success).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', select: ['raduis'] }).success).toBe(false);
    expect(
      schema.safeParse({ file_path: 'model.step', order_by: { by: 'diameter' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', order_by: { by: 'unknown' } }).success).toBe(
      false,
    );
  });

  it('query_edges accepts valid curve_type filter', () => {
    const schema = toolSchemas.query_edges;
    expect(schema.safeParse({ file_path: 'model.step', curve_type: 'circle' }).success).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', curve_type: 'invalid' }).success).toBe(
      false,
    );
  });

  it('query_edges rejects edge-irrelevant fields (strict mode)', () => {
    const schema = toolSchemas.query_edges;
    expect(schema.safeParse({ file_path: 'model.step', surface_type: 'cylinder' }).success).toBe(
      false,
    );
  });

  it('query_edges accepts radius and length filters', () => {
    const schema = toolSchemas.query_edges;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        curve_type: 'circle',
        radius_min: 1,
        length_min: 10,
      }).success,
    ).toBe(true);
  });

  it('query_edges rejects unknown select and order fields', () => {
    const schema = toolSchemas.query_edges;
    expect(schema.safeParse({ file_path: 'model.step', select: ['start_vertex'] }).success).toBe(
      true,
    );
    expect(schema.safeParse({ file_path: 'model.step', select: ['start_vertx'] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ file_path: 'model.step', order_by: { by: 'diameter' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ file_path: 'model.step', order_by: { by: 'unknown' } }).success).toBe(
      false,
    );
  });

  it('measure_step accepts ray_test_grid with entity_ids', () => {
    const schema = toolSchemas.measure_step;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        entity_ids: ['face:6', 'face:7'],
        op: 'ray_test_grid',
        direction: [0, 0, 1],
        spacing_mm: 2.0,
      }).success,
    ).toBe(true);
  });

  it('measure_step rejects invalid entity_ids', () => {
    const schema = toolSchemas.measure_step;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        entity_ids: ['dummy'],
        op: 'ray_test',
        direction: [0, 0, 1],
      }).success,
    ).toBe(false);
  });

  it('measure_step accepts direction shortcuts', () => {
    const schema = toolSchemas.measure_step;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        entity_ids: ['face:6'],
        op: 'ray_test_grid',
        direction: 'along_axis_both',
      }).success,
    ).toBe(true);
  });

  it('measure_step accepts distance op with to target', () => {
    const schema = toolSchemas.measure_step;
    expect(
      schema.safeParse({
        file_path: 'model.step',
        entity_ids: ['face:6', 'face:7'],
        op: 'distance',
        to: 'edge:0',
      }).success,
    ).toBe(true);
  });

  it('diff_step rejects unknown fields', () => {
    const schema = toolSchemas.diff_step;
    expect(
      schema.safeParse({
        baseline_file_path: 'a.step',
        comparison_file_path: 'b.step',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        baseline_file_path: 'a.step',
        comparison_file_path: 'b.step',
        extra: 'no',
      }).success,
    ).toBe(false);
  });

  describe('tool examples', () => {
    it('every tool has at least one example', () => {
      for (const name of Object.keys(toolSchemas)) {
        const examples = toolExamples[name as keyof typeof toolExamples];
        expect(examples.length).toBeGreaterThan(0);
      }
    });

    it('query_faces examples parse successfully', () => {
      for (const ex of toolExamples.query_faces) {
        const result = toolSchemas.query_faces.safeParse(ex);
        if (!result.success) {
          console.error('Invalid query_faces example:', ex, result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });

    it('query_edges examples parse successfully', () => {
      for (const ex of toolExamples.query_edges) {
        const result = toolSchemas.query_edges.safeParse(ex);
        if (!result.success) {
          console.error('Invalid query_edges example:', ex, result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });

    it('measure_step examples parse successfully', () => {
      for (const ex of toolExamples.measure_step) {
        const result = toolSchemas.measure_step.safeParse(ex);
        if (!result.success) {
          console.error('Invalid measure_step example:', ex, result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });
  });

  it('query-help uses public contract field lists', () => {
    const help = JSON.parse(queryHelpResourceHandler().text) as {
      tables: {
        faces: { where_fields: string[]; select_fields: string[]; group_by: string[] };
        edges: { where_fields: string[]; select_fields: string[]; group_by: string[] };
      };
      tools: {
        query_faces: { shape: { order_by: string } };
        query_edges: { shape: { order_by: string } };
      };
    };

    expect(help.tables.faces.where_fields).toEqual(FACE_WHERE_FIELDS);
    expect(help.tables.faces.select_fields).toEqual(FACE_SELECT_FIELDS);
    expect(help.tables.faces.group_by).toEqual(FACE_GROUP_BY_FIELDS);
    expect(help.tools.query_faces.shape.order_by).toContain(FACE_ORDER_FIELDS.join(', '));

    expect(help.tables.edges.where_fields).toEqual(EDGE_WHERE_FIELDS);
    expect(help.tables.edges.select_fields).toEqual(EDGE_SELECT_FIELDS);
    expect(help.tables.edges.group_by).toEqual(EDGE_GROUP_BY_FIELDS);
    expect(help.tools.query_edges.shape.order_by).toContain(EDGE_ORDER_FIELDS.join(', '));
  });
});
