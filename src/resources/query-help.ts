/**
 * `cad-mcp://query-help` resource.
 *
 * MCP Resources are application-controlled read-only data sources that the
 * LLM client loads into context for schema discovery.
 *
 * This resource returns a compact JSON document covering:
 *   - Tool descriptions and purpose
 *   - Supported query fields per entity type
 *   - group_by dimensions, measure ops
 *   - Usage examples
 */

import {
  CURVE_TYPES,
  EDGE_GROUP_BY_FIELDS,
  EDGE_ORDER_FIELDS,
  EDGE_SELECT_FIELDS,
  EDGE_WHERE_FIELDS,
  FACE_GROUP_BY_FIELDS,
  FACE_ORDER_FIELDS,
  FACE_SELECT_FIELDS,
  FACE_WHERE_FIELDS,
  MEASURE_OPS,
  RETURN_TYPES,
  SURFACE_TYPES,
} from '../public-contract.js';
import { toolExamples } from '../schemas/examples.js';
import pkg from '../../package.json' with { type: 'json' };

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

function buildHelpDocument() {
  return {
    version: pkg.version,
    surface: '5-tool (inspect → query → measure pattern)',
    description:
      'CAD MCP Server exposes 5 read-only tools for STEP geometry inspection. Workflow: (1) inspect_step for overview, (2) query_faces or query_edges to find entities, (3) measure_step for geometric measurements on discovered entities.',
    rules: [
      'Start with inspect_step for model overview.',
      'Use query_faces to find faces (cylinders, planes, etc.) and query_edges to find edges (circles, lines).',
      'Use measure_step with entity IDs from query_faces/query_edges for ray-tests, distance, etc.',
      'entity_ids in measure_step must come from a prior query result — never invent them.',
      'Omit optional fields entirely. Do not send empty arrays or zero bounds as placeholders.',
      'Batch measurements: pass multiple entity_ids to measure_step in one call.',
    ],
    tables: {
      faces: {
        description: 'Faces of the B-rep model.',
        where_fields: FACE_WHERE_FIELDS,
        select_fields: FACE_SELECT_FIELDS,
        group_by: FACE_GROUP_BY_FIELDS,
      },
      edges: {
        description: 'Edges of the B-rep model.',
        where_fields: EDGE_WHERE_FIELDS,
        select_fields: EDGE_SELECT_FIELDS,
        group_by: EDGE_GROUP_BY_FIELDS,
      },
    },
    tools: {
      inspect_step: {
        purpose:
          'Compact first-pass overview: dimensions, body count, topology, validity, PMI presence.',
        example: toolExamples.inspect_step[0],
      },
      query_faces: {
        purpose: 'Find and filter faces. Returns IDs, surface types, areas, radii, axes, normals.',
        shape: {
          file_path: 'string (required)',
          surface_type: `enum (optional): ${SURFACE_TYPES.join(', ')}`,
          where_fields: 'see tables.faces.where_fields',
          group_by: `enum[] (optional): ${FACE_GROUP_BY_FIELDS.join(', ')}`,
          select: 'string[] (optional): see tables.faces.select_fields',
          order_by: `{by, direction} (optional): by ${FACE_ORDER_FIELDS.join(', ')}`,
          aggregate: 'string[] (optional): "count", "min:area", "max:radius", "avg:diameter"',
          limit: 'integer (default 100, max 1000)',
          offset: 'integer (default 0)',
          return_type: `enum (default entities): ${RETURN_TYPES.join(', ')}`,
        },
        examples: toolExamples.query_faces,
      },
      query_edges: {
        purpose: 'Find and filter edges. Returns IDs, curve types, lengths, radii.',
        shape: {
          file_path: 'string (required)',
          curve_type: `enum (optional): ${CURVE_TYPES.join(', ')}`,
          where_fields: 'see tables.edges.where_fields',
          group_by: `enum[] (optional): ${EDGE_GROUP_BY_FIELDS.join(', ')}`,
          select: 'string[] (optional): see tables.edges.select_fields',
          order_by: `{by, direction} (optional): by ${EDGE_ORDER_FIELDS.join(', ')}`,
          aggregate: 'string[] (optional): "count", "min:radius", "max:length"',
          limit: 'integer (default 100, max 1000)',
          offset: 'integer (default 0)',
          return_type: `enum (default entities): ${RETURN_TYPES.join(', ')}`,
        },
        examples: toolExamples.query_edges,
      },
      measure_step: {
        purpose:
          'Batch geometric measurement on known entity IDs. Supports ray-tests, distance, section, curvature, point classification.',
        shape: {
          file_path: 'string (required)',
          entity_ids: 'face:N[] | edge:N[] | body:N[] (required, from prior query/inspect)',
          op: `enum (required): ${MEASURE_OPS.join(', ')}`,
          direction: '[x,y,z] | "along_axis" | "along_axis_both" | "normal" (ray/draft ops)',
          origin: '[x,y,z] | "extent_min" | "extent_center" | "extent_max" (ray ops)',
          spacing_mm: 'number (ray_test_grid, default 2.0)',
          tmax: 'number (ray_test_segment, max ray distance)',
          to: 'entity ID (distance ops)',
          point:
            '[x,y,z] (classify_point, closest_point_on_face, contains_point, surface_curvature, edge_projection)',
          plane_origin: '[x,y,z] (section_by_plane)',
          plane_normal: '[x,y,z] (section_by_plane)',
          param: 'number 0-1 (reserved for parameterized measurement ops)',
          with: 'face:N | edge:N (other entity for continuity-style checks)',
          tolerance: 'number (contains_point, default 0.01)',
          detail_level: 'aggregate | summary | points (ray result detail)',
        },
        examples: toolExamples.measure_step,
      },
      diff_step: {
        purpose: 'Compare two STEP files: dimension, volume, area, topology deltas.',
        example: toolExamples.diff_step[0],
      },
    },
    enums: {
      surface_type: SURFACE_TYPES,
      curve_type: CURVE_TYPES,
      measure_ops: MEASURE_OPS,
      return_types: RETURN_TYPES,
    },
  };
}
