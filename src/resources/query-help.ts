import { CURVE_TYPES, SURFACE_TYPES } from '../tool-defs.js';
import { TOOL_REGISTRY } from '../tools/registry.js';
import { MEASURE_KINDS } from '../tools/measure.js';
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
    surface: '4 read-only tools: inspect → find_entities → measure / diff',
    description:
      'CAD MCP returns parsed STEP facts and geometric measurements. It does not determine manufacturability, compliance, safety, or design intent. Other MCP servers or the host may provide interpretation workflows.',
    rules: [
      'Start with inspect for dimensions, bounds, counts, and B-rep validity.',
      'Use find_entities with entity_type=face, edge, vertex, or body. Set component_name from inspect.structure.component_occurrences. A base name selects all repeated instances; a full occurrence name such as RepeatedPart#0 selects one. Returned IDs distinguish instances, e.g. component:RepeatedPart#0/body:0; pass an exact returned ID to measure. Faces support surface_type/area/radius filters; edges support curve_type/length/radius. Vertices return coordinates; bodies return volume.',
      'Use limit/offset for bounded pagination (default limit=100, maximum 1000).',
      'Use measure with one kind: distance, thickness, draft, ray, ray_grid, point_analysis, section, or continuity. Follow that kind’s required parameters in the schema.',
      'Entity IDs are model-local and occurrence-aware; copy them from find_entities and use them only with the same STEP revision.',
      'Use diff to compare geometry and parsed STEP schema/product/authoring metadata between revisions.',
      'Treat measurements as geometry facts. Apply process limits, tolerances, material data, drawings, and requirements separately before making engineering judgments.',
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
      measure_kind: MEASURE_KINDS,
    },
  };
}
