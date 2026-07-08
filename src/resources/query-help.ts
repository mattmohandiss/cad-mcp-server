import { CURVE_TYPES, SURFACE_TYPES } from '../tool-defs.js';
import { examples as inspectExamples } from '../tools/inspect.js';
import { examples as findFacesExamples } from '../tools/find-faces.js';
import { examples as findEdgesExamples } from '../tools/find-edges.js';
import { examples as measureDistanceExamples } from '../tools/measure-distance.js';
import { examples as measureThicknessExamples } from '../tools/measure-thickness.js';
import { examples as measureDraftExamples } from '../tools/measure-draft.js';
import { examples as measureGeometryExamples } from '../tools/measure-geometry.js';
import { examples as diffExamples } from '../tools/diff.js';
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
    tools: {
      inspect_step: {
        purpose: 'Compact overview: dimensions, counts, health. Use include[] for detail.',
        example: inspectExamples[0],
      },
      find_faces: {
        purpose: 'Find faces by type, area, radius, normal, quality, or body.',
        examples: findFacesExamples,
      },
      find_edges: {
        purpose: 'Find edges by curve type, length, radius, or dihedral angle.',
        examples: findEdgesExamples,
      },
      measure_distance: {
        purpose: 'Distance between entity sets. Use sources[]+targets[] and summary="minimum".',
        examples: measureDistanceExamples,
      },
      measure_thickness: {
        purpose: 'Wall thickness via ray grid sampling across faces.',
        examples: measureThicknessExamples,
      },
      measure_draft: {
        purpose: 'Draft angles relative to a pull direction. Returns undercut flags.',
        examples: measureDraftExamples,
      },
      measure_geometry: {
        purpose: 'Ray tests, point analysis, cross-sections, edge continuity.',
        examples: measureGeometryExamples,
      },
      diff_step: {
        purpose: 'Compare two STEP files: volume, area, dimension, topology deltas.',
        example: diffExamples[0],
      },
    },
    enums: {
      surface_type: SURFACE_TYPES,
      curve_type: CURVE_TYPES,
      measurement_type: ['ray', 'ray_grid', 'point_analysis', 'section', 'continuity'],
    },
  };
}
