import type { ToolAnnotations } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import * as diffTool from './diff.js';
import * as inspectTool from './inspect.js';
import * as findEntities from './find-entities.js';
import * as measureTool from './measure.js';
import * as outputSchemas from '../output-schemas.js';

// Every cad-mcp tool is a read-only geometry query over a caller-supplied STEP path.
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** A registry entry with its input type erased so the array stays homogeneous. */
export interface ToolSpec {
  name: string;
  title: string;
  description: string;
  purpose: string;
  examples: readonly unknown[];
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: ToolAnnotations;
  handler: (args: unknown) => Promise<Record<string, unknown>>;
}

/**
 * Erase a tool's per-tool input type so it can join a homogeneous registry while
 * the handler keeps its exact input type. MCP validates inputs before the
 * handler runs.
 */
function defineTool<I>(tool: {
  name: string;
  title: string;
  description: string;
  purpose: string;
  examples: readonly unknown[];
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType;
  annotations: ToolAnnotations;
  handler: (args: I) => Promise<Record<string, unknown>>;
}): ToolSpec {
  return { ...tool, handler: (args: unknown) => tool.handler(args as I) };
}

export const TOOL_REGISTRY: ToolSpec[] = [
  defineTool({
    name: 'inspect',
    title: 'Inspect Model Overview',
    description:
      'Inspect a local STEP artifact by filesystem path or file: URI. Returns its content revision with dimensions, counts, and B-rep validity. Call this first; use the returned artifact reference for entity searches and measurements. ' +
      'Use include to request only size, counts, and/or health sections.',
    purpose: 'Overview: dimensions, counts, and B-rep validity.',
    inputSchema: inspectTool.schema,
    examples: inspectTool.examples,
    handler: inspectTool.handler,
    outputSchema: outputSchemas.inspect,
    annotations: READ_ONLY,
  }),
  defineTool({
    name: 'find_entities',
    title: 'Find Model Entities',
    description:
      'Find faces, edges, vertices, or solid bodies in the revision-bound artifact returned by inspect, optionally scoped to an assembly component_name. ' +
      'Faces support surface type, area, and radius filters; edges support curve type, length, and radius. Vertices return coordinates and bodies return volume. ' +
      'Occurrence IDs distinguish repeated component instances; copy returned IDs into measure sources/targets.',
    purpose: 'Find whole-model or occurrence-scoped entities for measurement.',
    inputSchema: findEntities.schema,
    examples: findEntities.examples,
    handler: findEntities.handler,
    outputSchema: outputSchemas.query,
    annotations: READ_ONLY,
  }),
  defineTool({
    name: 'measure',
    title: 'Measure Geometry',
    description:
      'Measure distance, wall thickness, draft, rays/ray grids, point geometry, planar sections, or edge continuity. Use the artifact reference and entity IDs from the same find_entities result. ' +
      'Returns geometric measurements only, not engineering acceptance or design recommendations. Requests are bounded; geometry and OCCT handles remain in the sidecar.',
    purpose: 'Distance, thickness, draft, ray, point, section, and continuity measurements.',
    inputSchema: measureTool.schema,
    examples: measureTool.examples,
    handler: measureTool.handler,
    outputSchema: outputSchemas.measure,
    annotations: READ_ONLY,
  }),
  defineTool({
    name: 'diff',
    title: 'Compare Step Versions',
    description:
      'Compare baseline and candidate STEP artifacts, as filesystem paths or file: URIs. Returns both content revisions, geometry deltas, and parsed document facts: schema, product names/count, assembly flag, authoring system, and organization. ' +
      'These are file-level facts; they do not explain design intent.',
    purpose: 'Compare geometric measurements and STEP document metadata.',
    inputSchema: diffTool.schema,
    examples: diffTool.examples,
    handler: diffTool.handler,
    outputSchema: outputSchemas.diff,
    annotations: READ_ONLY,
  }),
];

export const PUBLIC_TOOL_NAMES = TOOL_REGISTRY.map((tool) => tool.name);
