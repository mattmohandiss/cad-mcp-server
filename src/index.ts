#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleCompareStepFiles,
  handleInspectStepFile,
  handleQueryStepEdges,
  handleQueryStepFaces,
  handleQueryStepFeatures,
  stepToolSchemas,
} from './tools/step-tools.js';
import { isToolError } from './tools/shared.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: '0.1.0',
});

function jsonToolResult(result: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: isToolError(result),
  };
}

type StepToolResult =
  | ReturnType<typeof jsonToolResult>
  | Promise<ReturnType<typeof jsonToolResult>>;
type RegisterTool = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodType>;
  },
  callback: (args: Record<string, unknown>) => StepToolResult
) => unknown;

const registerTool = server.registerTool.bind(server) as RegisterTool;

function withErrorContext(
  toolName: string,
  handler: (args: Record<string, unknown>) => StepToolResult
) {
  return async (args: Record<string, unknown>) => {
    try {
      return await handler(args);
    } catch (error) {
      console.error(`Tool ${toolName} failed:`, error);
      throw error;
    }
  };
}

registerTool(
  'inspect_step_file',
  {
    title: 'Inspect STEP File',
    description:
      'Fast first-pass STEP overview with import status, units, metadata, bounding box, counts, geometric properties, health, and provider limitations. Example: {file_path:"model.step"}',
    inputSchema: stepToolSchemas.inspectStepFile,
  },
  async ({ file_path }) => jsonToolResult(await handleInspectStepFile(String(file_path)))
);

registerTool(
  'query_step_faces',
  {
    title: 'Query STEP Faces',
    description:
      'Query B-rep faces and surfaces by deterministic model facts such as surface type, area, normal direction, bounding box, and adjacency. All coordinates and dimensions in model units (typically mm). Filters combine with AND across fields; a multi-value array (e.g. surface_type) matches any listed value (OR within the array). Use region or near for spatial queries, surface_type/area for property filtering. For an overview of a large model, set result_mode "groups" with group_by (e.g. ["surface_type"]) to get per-group counts plus sample IDs instead of a long entity list, then drill into specific entities. Supports sorting, pagination, and result projection. Example: {file_path:"model.step",result_mode:"groups",group_by:["surface_type"]}',
    inputSchema: stepToolSchemas.queryStepFaces,
  },
  withErrorContext('query_step_faces', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleQueryStepFaces(String(query.file_path), query as never));
  })
);

registerTool(
  'query_step_edges',
  {
    title: 'Query STEP Edges',
    description:
      'Query B-rep geometric edges and curves by deterministic model facts such as curve type, length, radius, and bounding box. All coordinates and dimensions in model units (typically mm). Filters combine with AND across fields; a multi-value array (e.g. curve_type) matches any listed value (OR within the array). Use region or near for spatial queries, curve_type/length for property filtering. Useful for finding small/degenerate edges: filter length_max, or set result_mode "groups" with group_by ["length_range"] where the 0-1 bucket isolates tiny edges. Supports sorting, pagination, and result projection. Example: {file_path:"model.step",filter:{length_max:1},sort:{by:"length",direction:"asc"},limit:50}',
    inputSchema: stepToolSchemas.queryStepEdges,
  },
  withErrorContext('query_step_edges', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleQueryStepEdges(String(query.file_path), query as never));
  })
);

registerTool(
  'query_step_features',
  {
    title: 'Query STEP Features',
    description:
      'Query derived feature candidates such as holes (through/blind), fillets, and pockets. All coordinates and dimensions in model units (typically mm). Returns heuristic B-rep-based candidates with confidence scores (0-1), not native CAD feature-tree facts. Filters combine with AND across fields; a multi-value array (e.g. feature_type) matches any listed value (OR within the array). Supports filtering by geometry (radius, diameter, depth), through/blind status, confidence, and spatial location. To count distinct hole sizes, set result_mode "groups" with group_by ["diameter"]; to split holes by through vs blind, group_by ["feature_type","through"]. Use confidence_min for high-confidence only. Example: {file_path:"model.step",result_mode:"groups",group_by:["feature_type","through"]}',
    inputSchema: stepToolSchemas.queryStepFeatures,
  },
  withErrorContext('query_step_features', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleQueryStepFeatures(String(query.file_path), query as never));
  })
);

registerTool(
  'compare_step_files',
  {
    title: 'Compare STEP Files',
    description:
      'Compare two STEP files and return metric deltas (differences) in geometry, topology, and metadata. Returns volume delta, surface area delta, face count delta, edge count delta, body count delta, and feature candidate count delta. All deltas are (file_b - file_a). For identical files, all geometric deltas equal 0. Also returns schema differences and product name changes. Use to track revisions, detect modifications, or validate file equivalence. Note: Comparison is metric-based; structural/feature-tree changes not tracked. Example: {file_a:"model_v1.step",file_b:"model_v2.step"}',
    inputSchema: stepToolSchemas.compareStepFiles,
  },
  async ({ file_a, file_b }) =>
    jsonToolResult(await handleCompareStepFiles(String(file_a), String(file_b)))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CAD MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
