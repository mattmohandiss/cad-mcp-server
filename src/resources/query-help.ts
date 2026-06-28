/**
 * `cad-mcp://query-help` resource.
 *
 * MCP Resources are application-controlled read-only data sources that the
 * LLM client loads into context for schema discovery. From the MCP docs:
 * "If you put your database schema as a tool, the model has to spend a turn
 *  calling it before it can write queries. If you put it as a resource, the
 *  model already knows the schema from the moment the server connects."
 *
 * This resource returns a compact JSON document containing the schema
 * reference (field names + types), the measure op vocabulary, the
 * group_by dimensions, all filter fields grouped by entity type, the 6
 * query_step input_examples, and the 4 transact_step input_examples.
 * The LLM fetches it on demand when starting an unfamiliar task.
 *
 * Note: we deliberately do NOT include the full Zod schema objects in
 * the help document — they contain internal references and would not
 * JSON-serialize cleanly. Instead we surface the *shape*: field names,
 * types, and requiredness, drawn from a static table. The full schema
 * is registered with the MCP server as the tool's inputSchema.
 */

import {
  ENTITIES,
  GROUP_BY_DIMENSIONS,
  MEASURE_OPS,
  PIPELINE_OPS,
  RETURN_TYPES,
  SURFACE_TYPES,
  CURVE_TYPES,
  VALIDITY_STATUSES,
  PMI_TYPES,
  TOLERANCE_SUBTYPES,
  MATERIAL_CONDITIONS,
  BODY_TYPES,
  COLOR_TYPES,
} from '../schemas/tool-schemas.js';
import { toolExamples } from '../schemas/examples.js';

export const QUERY_HELP_URI = 'cad-mcp://query-help';

interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export function queryHelpResourceHandler(): ResourceContent {
  const helpDoc = buildHelpDocument();
  return {
    uri: QUERY_HELP_URI,
    mimeType: 'application/json',
    text: JSON.stringify(helpDoc, null, 2),
  };
}

/* ------------------------------------------------------------------ */
/*  Build the help document                                            */
/* ------------------------------------------------------------------ */

function buildHelpDocument() {
  return {
    version: '0.2.0',
    surface: '4-tool',
    description:
      'CAD MCP Server exposes 4 read-only tools over a cached OCCT model. Tools return measured facts; the LLM interprets engineering meaning.',
    tools: {
      inspect_step: {
        purpose: 'Compact first-pass overview of a STEP file: dimensions, body count, topology, validity, XDE summary.',
        input: { file_path: 'string (required)' },
        example: toolExamples.inspect_step[0],
      },
      query_step: {
        purpose: 'Declarative query over faces, edges, bodies, vertices, pmi, color, layer, material, assembly_node.',
        input: {
          file_path: 'string (required)',
          entities: 'enum (required): ' + ENTITIES.join(', '),
          entity_ids: 'string[] (optional, direct lookup)',
          filter: 'object (optional, single bag with conditional semantics; see filter_fields_by_entity)',
          group_by: 'enum[] (optional, up to 3): ' + GROUP_BY_DIMENSIONS.join(', '),
          measure: 'object[] (optional, up to 10): see measure_ops',
          aggregate: 'string[] (optional, up to 20): format "<op>:<field>" — op in (count, min, max, avg, stddev, sum)',
          select: 'string[] (optional, up to 30): field names to include',
          sort: '{by, direction} (optional)',
          limit: 'integer (default 100, max 1000)',
          offset: 'integer (default 0)',
          return_type: 'enum (default entities): ' + RETURN_TYPES.join(', '),
        },
        entities: ENTITIES,
        group_by: GROUP_BY_DIMENSIONS,
        measure_ops: MEASURE_OPS,
        return_types: RETURN_TYPES,
        examples: toolExamples.query_step,
        filter_fields_by_entity: filterFieldsByEntity(),
        enums: {
          surface_type: SURFACE_TYPES,
          curve_type: CURVE_TYPES,
          validity_status: VALIDITY_STATUSES,
          pmi_type: PMI_TYPES,
          tolerance_subtype: TOLERANCE_SUBTYPES,
          material_condition: MATERIAL_CONDITIONS,
          body_type: BODY_TYPES,
          color_type: COLOR_TYPES,
        },
      },
      diff_step: {
        purpose: 'Compare two STEP files: dimension, volume, area, topology, body, PMI, color, material deltas.',
        input: {
          baseline_file_path: 'string (required)',
          comparison_file_path: 'string (required)',
        },
        example: toolExamples.diff_step[0],
      },
      transact_step: {
        purpose: 'Imperative pipeline for multi-step workflows needing iteration across result sets.',
        input: {
          file_path: 'string (required)',
          pipeline: 'array of {op, params, do, where, fields} (required, 1-50 steps)',
          return_intermediate: 'boolean (default false)',
        },
        pipeline_ops: PIPELINE_OPS,
        examples: toolExamples.transact_step,
      },
    },
    migration_from_9_tool_surface: {
      inspect_step_file: 'inspect_step (single call)',
      find_step_faces: 'query_step({entities: "faces", filter: {...}, group_by: [...], select: [...]})',
      find_step_edges: 'query_step({entities: "edges", filter: {...}, group_by: [...], select: [...]})',
      get_step_entities: 'query_step({entities: "<type>", entity_ids: ["face:5", ...]})',
      query_step_pmi: 'query_step({entities: "pmi", filter: {...}, select: [...]})',
      query_ray_intersect: 'query_step({entities: "faces", measure: [{op: "ray_test", ...}]})',
      measure_distance: 'query_step({entities: "faces", measure: [{op: "distance", to: "face:N"}]})',
      compare_step_files: 'diff_step({baseline_file_path, comparison_file_path})',
      find_coaxial_cylinders: 'query_step({entities: "faces", filter: {surface_type: "cylinder"}, group_by: ["axis"], select: [...]})',
    },
    caveats: [
      'In the initial cut, only `faces` and `edges` entity types are fully wired through the engine. Other entity types return a "not yet implemented" error with a clear migration message; they ship alongside the Tier A kernel methods.',
      'measure and aggregate dispatch is staged; the response returns the base query result with a `limitations` entry that explains the staging. The op vocabulary is fully described here so callers can compose queries against the staged surface.',
      'transact_step supports `query` and `select`; `for_each`, `filter_results`, and `walk_assembly` parse but defer execution to a subsequent release.',
    ],
  };
}

function filterFieldsByEntity() {
  /* Walk the filter schema to identify which keys apply to which entity
   * type. The grouping is a documentation aid for the LLM; the engine
   * itself uses the single-bag filter and ignores irrelevant fields. */
  const groups: Record<string, string[]> = {
    faces: ['surface_type', 'area_min', 'area_max', 'normal', 'radius_min', 'radius_max', 'body_ids', 'validity_status', 'tolerance_max', 'canonical_form', 'linked_to_pmi'],
    edges: ['curve_type', 'length_min', 'length_max', 'radius_min', 'radius_max', 'curvature_min', 'curvature_max', 'has_curve3d', 'body_ids', 'validity_status', 'tolerance_max', 'linked_to_pmi'],
    bodies: ['body_type', 'volume_min', 'volume_max', 'validity_status'],
    vertices: ['tolerance_max'],
    pmi: ['pmi_type', 'tolerance_subtype', 'value_min', 'value_max', 'material_condition', 'linked_to'],
    color: ['color_type', 'rgb'],
    layer: ['layer_name'],
    material: ['material_name'],
    assembly_node: ['node_name', 'is_instance', 'is_root'],
  };
  return groups;
}
