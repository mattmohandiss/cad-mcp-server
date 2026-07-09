import { CURVE_TYPES, MEASUREMENT_TYPES, SURFACE_TYPES } from '../tool-defs.js';
import { TOOL_REGISTRY } from '../tools/registry.js';
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
    surface: '8-tool (inspect → find → measure pattern)',
    description:
      'CAD MCP Server exposes 8 read-only tools for STEP geometry inspection. Workflow: (1) inspect_step for overview, (2) find_faces or find_edges to find entities, (3) measure_distance/measure_thickness/measure_draft/measure_geometry for measurements.',
    rules: [
      'Start with inspect_step for model overview.',
      'Use find_faces to find faces and find_edges to find edges.',
      'Use measure_distance for clearance/gap checks with sources+targets and summary="minimum".',
      'Use measure_thickness for wall thickness with faces[] and direction_mode="normal".',
      'Use measure_draft for draft angles with faces[] and pull_direction.',
      'Use measure_geometry for ray tests, point analysis, sections, and continuity.',
      'Entity IDs must come from a prior tool result; never invent them.',
      'Omit optional fields entirely. Do not send empty arrays or zero bounds as placeholders.',
    ],
    tools: Object.fromEntries(
      TOOL_REGISTRY.map((tool) => [
        tool.name,
        {
          purpose: tool.purpose,
          examples: tool.examples,
        },
      ]),
    ),
    enums: {
      surface_type: SURFACE_TYPES,
      curve_type: CURVE_TYPES,
      measurement_type: MEASUREMENT_TYPES,
    },
  };
}
