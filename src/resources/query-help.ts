import { CURVE_TYPES, SURFACE_TYPES } from '../tool-schemas.js';
import { TOOL_REGISTRY } from '../tools/registry.js';
import { MEASURE_KINDS } from '../tools/measure.js';
import pkg from '../../package.json' with { type: 'json' };

export const QUERY_HELP_URI = 'cad://help';

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
      'Start with inspect using a file: URI. It returns an artifact reference with a SHA-256 revision.',
      'Pass the exact artifact reference from inspect to find_entities. Use entity_type=face, edge, vertex, or body. Set component_name from the result component_occurrences. Returned IDs are scoped to that artifact revision and id scheme; copy them exactly.',
      'Use limit/offset for bounded pagination (default limit=100, maximum 1000).',
      'Use measure with one kind: distance, thickness, draft, ray, ray_grid, point_analysis, section, or continuity. Follow that kind’s required parameters in the schema.',
      'Pass the same artifact reference and IDs from find_entities to measure. A changed file revision is rejected as stale instead of reusing old IDs.',
      'Use diff with baseline and candidate file: URIs; its output identifies both input revisions.',
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
