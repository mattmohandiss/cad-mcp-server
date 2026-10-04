import * as diffTool from './diff.js';
import * as inspectTool from './inspect.js';
import * as findEntities from './find-entities.js';
import * as measureTool from './measure.js';
import * as outputSchemas from '../output-schemas.js';

export const TOOL_REGISTRY = [
  {
    name: 'inspect',
    title: 'Inspect Model Overview',
    description:
      'Get dimensions, bounding box, volume, surface area, solid/face/edge counts, and B-rep validity for a STEP model. Call this first to ground follow-up queries. ' +
      'Use include to request only size, counts, and/or health sections.',
    purpose: 'Overview: dimensions, counts, and B-rep validity.',
    schema: inspectTool.schema,
    examples: inspectTool.examples,
    handler: inspectTool.handler,
    outputSchema: outputSchemas.inspect,
  },
  {
    name: 'find_entities',
    title: 'Find Model Entities',
    description:
      'Find faces, edges, vertices, or solid bodies, optionally scoped to an assembly component_name from inspect.component_occurrences. ' +
      'Faces support surface type, area, and radius filters; edges support curve type, length, and radius. Vertices return coordinates and bodies return volume. ' +
      'Occurrence IDs distinguish repeated component instances; copy returned IDs into measure sources/targets.',
    purpose: 'Find whole-model or occurrence-scoped entities for measurement.',
    schema: findEntities.schema,
    examples: findEntities.examples,
    handler: findEntities.handler,
    outputSchema: outputSchemas.query,
  },
  {
    name: 'measure',
    title: 'Measure Geometry',
    description:
      'Measure distance, wall thickness, draft, rays/ray grids, point geometry, planar sections, or edge continuity. Use find_entities first to obtain model-local IDs. ' +
      'Returns geometric measurements only, not engineering acceptance or design recommendations. Requests are bounded; geometry and OCCT handles remain in the sidecar.',
    purpose: 'Distance, thickness, draft, ray, point, section, and continuity measurements.',
    schema: measureTool.schema,
    examples: measureTool.examples,
    handler: measureTool.handler,
    outputSchema: outputSchemas.measure,
  },
  {
    name: 'diff',
    title: 'Compare Step Versions',
    description:
      'Compare two STEP files. Returns geometry deltas and parsed document facts: schema, product names/count, assembly flag, authoring system, and organization. ' +
      'These are file-level facts; they do not explain design intent.',
    purpose: 'Compare geometric measurements and STEP document metadata.',
    schema: diffTool.schema,
    examples: diffTool.examples,
    handler: diffTool.handler,
    outputSchema: outputSchemas.diff,
  },
] as const;

export const PUBLIC_TOOL_NAMES = TOOL_REGISTRY.map((tool) => tool.name);
