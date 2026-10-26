import { CURVE_TYPES, SURFACE_TYPES } from '../tool-schemas.js';
import { TOOL_REGISTRY } from '../tools/registry.js';
import { MEASURE_KINDS, MEASURE_KIND_SPECS } from '../tools/measure.js';
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
    surface: '5 read-only tools: inspect → find_entities → measure / describe_pmi / diff',
    description:
      'CAD MCP returns parsed STEP facts and geometric measurements. It does not determine manufacturability, compliance, safety, or design intent. Other MCP servers or the host may provide interpretation workflows.',
    rules: [
      'Start with inspect using a file: URI. It returns an artifact reference with a SHA-256 revision.',
      'Pass the exact artifact reference from inspect to find_entities. Use entity_type=face, edge, vertex, or body. Set component_name from the result component_occurrences. Returned IDs are scoped to that artifact revision and id scheme; copy them exactly.',
      'Use limit/offset for bounded pagination (default limit=100, maximum 1000).',
      'Use measure with one kind. Each kind has its own required arguments; measure_kinds below lists them, and the same notes are on the tool schema fields.',
      'Pass the same artifact reference and IDs from find_entities to measure. A changed file revision is rejected as stale instead of reusing old IDs.',
      'Use diff with baseline and candidate file: URIs; its output identifies both input revisions.',
      'Use describe_pmi to read the dimensions, geometric tolerances, and datums a file declares, with the entity IDs they apply to. Values are in the declared unit, and a tolerance whose magnitude could not be read is marked value_resolved: false rather than reported as 0. An empty section means the file declares no PMI.',
      'Treat measurements and PMI as declared facts. Apply process limits, material data, drawings, and requirements separately before making engineering judgments.',
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
    // Per-kind argument contract, shared with the measure tool schema so the
    // two cannot drift.
    measure_kinds: MEASURE_KIND_SPECS,
  };
}
