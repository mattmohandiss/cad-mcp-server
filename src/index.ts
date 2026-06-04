#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleAnalyzeStepFile } from './tools/analyze.js';
import { handleListBodies } from './tools/bodies.js';
import { handleExtractEdges } from './tools/edges.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: '0.1.0',
});

const stepFileInput: { file_path: z.ZodString } = {
  file_path: z.string().min(1).describe('Absolute or relative path to the STEP file to analyze'),
};

function jsonToolResult(result: unknown) {
  const failed =
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as { success?: unknown }).success === false;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: failed,
  };
}

type StepFileArgs = { file_path: string };
type StepToolResult =
  | ReturnType<typeof jsonToolResult>
  | Promise<ReturnType<typeof jsonToolResult>>;
type RegisterStepTool = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: typeof stepFileInput;
  },
  callback: (args: StepFileArgs) => StepToolResult
) => unknown;

const registerStepTool = server.registerTool.bind(server) as RegisterStepTool;

registerStepTool(
  'analyze_step_file',
  {
    title: 'Analyze STEP File',
    description:
      'Analyze a STEP file using OpenCascade WASM and return bounding box, dimensions, volume, surface area, and body count.',
    inputSchema: stepFileInput,
  },
  async ({ file_path }: { file_path: string }) =>
    jsonToolResult(await handleAnalyzeStepFile(file_path))
);

registerStepTool(
  'list_bodies',
  {
    title: 'List Bodies',
    description:
      'List all bodies in a STEP file with per-body geometry and basic detected features.',
    inputSchema: stepFileInput,
  },
  async ({ file_path }: { file_path: string }) => jsonToolResult(await handleListBodies(file_path))
);

registerStepTool(
  'extract_edges',
  {
    title: 'Extract Edges',
    description:
      'Extract edge statistics and basic feature indicators from a STEP file using OpenCascade WASM.',
    inputSchema: stepFileInput,
  },
  async ({ file_path }: { file_path: string }) =>
    jsonToolResult(await handleExtractEdges(file_path))
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
