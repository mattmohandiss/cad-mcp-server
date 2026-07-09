import * as diffStep from './diff.js';
import * as findEdges from './find-edges.js';
import * as findFaces from './find-faces.js';
import * as inspectStep from './inspect.js';
import * as measureDistance from './measure-distance.js';
import * as measureDraft from './measure-draft.js';
import * as measureGeometry from './measure-geometry.js';
import * as measureThickness from './measure-thickness.js';

export const TOOL_REGISTRY = [
  {
    name: 'inspect_step',
    description:
      'Use this FIRST for a compact model overview: dimensions, bounding box, body/face/edge counts, validity, watertight status. Use include[] for bodies, quality, pmi, inertia, or topology detail.',
    purpose: 'Compact overview: dimensions, counts, health. Use include[] for detail.',
    schema: inspectStep.schema,
    examples: inspectStep.examples,
    handler: inspectStep.handler,
  },
  {
    name: 'find_faces',
    description:
      'Find faces by type, area, radius, normal, quality, or body. Returns IDs, surface types, areas, radii, diameters, axes, normals. Use returned IDs in measure_distance, measure_thickness, measure_draft, or measure_geometry.',
    purpose: 'Find faces by type, area, radius, normal, quality, or body.',
    schema: findFaces.schema,
    examples: findFaces.examples,
    handler: findFaces.handler,
  },
  {
    name: 'find_edges',
    description:
      'Find edges by curve type, length, radius, or dihedral angle. Returns IDs, curve types, lengths, radii, diameters. Use returned IDs in measure_distance or measure_geometry.',
    purpose: 'Find edges by curve type, length, radius, or dihedral angle.',
    schema: findEdges.schema,
    examples: findEdges.examples,
    handler: findEdges.handler,
  },
  {
    name: 'measure_distance',
    description:
      'Measure distance between entity sets. Pass sources[] and targets[] for set-based measurement (e.g. clearance between holes and walls). Use summary="minimum" for the closest pair only.',
    purpose: 'Distance between entity sets. Use sources[]+targets[] and summary="minimum".',
    schema: measureDistance.schema,
    examples: measureDistance.examples,
    handler: measureDistance.handler,
  },
  {
    name: 'measure_thickness',
    description:
      'Measure wall thickness across faces via ray grid sampling. Returns min/max/avg thickness per face. Use direction_mode="normal" (default) or direction_mode="axis".',
    purpose: 'Wall thickness via ray grid sampling across faces.',
    schema: measureThickness.schema,
    examples: measureThickness.examples,
    handler: measureThickness.handler,
  },
  {
    name: 'measure_draft',
    description:
      'Measure draft angles of faces relative to a pull direction. Returns draft_angle_deg, normal, and undercut flag per face. Positive = good for ejection; negative = undercut.',
    purpose: 'Draft angles relative to a pull direction. Returns undercut flags.',
    schema: measureDraft.schema,
    examples: measureDraft.examples,
    handler: measureDraft.handler,
  },
  {
    name: 'measure_geometry',
    description:
      'Ray tests, point analysis, cross-sections, and edge continuity. measurement_type selects the op: ray, ray_grid, point_analysis, section, or continuity.',
    purpose: 'Ray tests, point analysis, cross-sections, edge continuity.',
    schema: measureGeometry.schema,
    examples: measureGeometry.examples,
    handler: measureGeometry.handler,
  },
  {
    name: 'diff_step',
    description:
      'Compare two STEP files. Returns deltas: volume, surface area, dimensions, face/edge/body counts. Comparison minus baseline.',
    purpose: 'Compare two STEP files: volume, area, dimension, topology deltas.',
    schema: diffStep.schema,
    examples: diffStep.examples,
    handler: diffStep.handler,
  },
] as const;

export const PUBLIC_TOOL_NAMES = TOOL_REGISTRY.map((tool) => tool.name);
