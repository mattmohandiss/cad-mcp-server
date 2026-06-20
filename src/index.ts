#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleCompareStepFiles,
  handleFindStepEdges,
  handleFindStepFaces,
  handleGetStepEntities,
  handleInspectStepFile,
  handleQueryStepPmi,
  stepToolOutputSchemas,
  stepToolSchemas,
} from './tools/step-tools.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: '0.1.0',
});

type ToolResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { type: string; message: string } };

function isToolResult(value: unknown): value is ToolResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as ToolResponse<unknown>).ok === 'boolean'
  );
}

export function jsonToolResult(result: unknown) {
  if (isToolResult(result)) {
    if (result.ok) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
        structuredContent: result.data,
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `${result.error.type}: ${result.error.message}`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
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
    outputSchema?: Record<string, z.ZodType> | z.ZodTypeAny;
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
      'Compact first-pass overview of a STEP file. Use this FIRST to identify the part, check validity, get topology counts, and detect small-geometry indicators. Returns no detailed entity lists; follow up with find_step_faces, find_step_edges, or get_step_entities for detail. Do NOT use for entity-level searches. Example: {file_path:"model.step"}',
    inputSchema: stepToolSchemas.inspectStepFile,
    outputSchema: stepToolOutputSchemas.inspectStepFile,
  },
  async ({ file_path }) => jsonToolResult(await handleInspectStepFile(String(file_path)))
);

registerTool(
  'find_step_faces',
  {
    title: 'Find STEP Faces',
    description:
      'Search faces by surface type, area, spatial region, or proximity. Use when you need specific faces such as large faces, cylindrical faces, faces near a point, or grouped face statistics. Do NOT use for known face IDs; use get_step_entities. Use only the filters needed for the question; adding every optional filter over-constrains results. Example small faces: {file_path:"model.step",area_max:1,sort_by:"area"}. Example cylinders by radius: {file_path:"model.step",surface_types:["cylinder"],return_type:"groups",group_by:["radius"]}',
    inputSchema: stepToolSchemas.findStepFaces,
    outputSchema: stepToolOutputSchemas.findStepFaces,
  },
  withErrorContext('find_step_faces', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleFindStepFaces(String(query.file_path), query as never));
  })
);

registerTool(
  'find_step_edges',
  {
    title: 'Find STEP Edges',
    description:
      'Search edges by curve type, length, circular radius, spatial region, or proximity. Use for tiny-edge investigation, long edges, circular edges, or grouped edge statistics. For tiny edges use length_max and sort_by:"length"; omit radius filters unless specifically querying circular edges by radius. radius_min/radius_max only affect circle edges and do not exclude line or bspline edges. Do NOT use for known edge IDs; use get_step_entities. Example tiny edges: {file_path:"model.step",length_max:0.5,sort_by:"length",fields:["id","length","curve_type"]}',
    inputSchema: stepToolSchemas.findStepEdges,
    outputSchema: stepToolOutputSchemas.findStepEdges,
  },
  withErrorContext('find_step_edges', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleFindStepEdges(String(query.file_path), query as never));
  })
);

registerTool(
  'get_step_entities',
  {
    title: 'Get STEP Entities',
    description:
      'Retrieve one or more known faces or edges by exact entity ID. IDs come from inspect_step_file, find_step_faces, or find_step_edges. Use ONLY when you already have specific IDs. Do NOT use for searching or filtering; use find_step_faces or find_step_edges. Example: {file_path:"model.step",entity_type:"face",entity_ids:["face:0"],fields:["id","area","normal"]}',
    inputSchema: stepToolSchemas.getStepEntities,
    outputSchema: stepToolOutputSchemas.getStepEntities,
  },
  withErrorContext('get_step_entities', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleGetStepEntities(String(query.file_path), query as never));
  })
);

registerTool(
  'compare_step_files',
  {
    title: 'Compare STEP Files',
    description:
      'Compare two STEP files and return whole-model metric deltas and metadata changes. Use for two revisions of a part when you need factual differences in dimensions, volume, area, topology counts, or exchange metadata. Does NOT track feature identity across revisions. Deltas are comparison_file_path minus baseline_file_path. Example: {baseline_file_path:"model_v1.step",comparison_file_path:"model_v2.step"}',
    inputSchema: stepToolSchemas.compareStepFiles,
    outputSchema: stepToolOutputSchemas.compareStepFiles,
  },
  async ({ baseline_file_path, comparison_file_path }) =>
    jsonToolResult(
      await handleCompareStepFiles(String(baseline_file_path), String(comparison_file_path))
    )
);

registerTool(
  'query_step_pmi',
  {
    title: 'Query STEP PMI',
    description:
      'Query Product Manufacturing Information (PMI): geometric tolerances, dimensions, datums, and annotations. Use return_type:"summary" first to check whether PMI exists. Not all STEP files contain PMI; AP203 files commonly do not. Example quick check: {file_path:"model.step",return_type:"summary"}',
    inputSchema: stepToolSchemas.queryStepPmi,
    outputSchema: stepToolOutputSchemas.queryStepPmi,
  },
  withErrorContext('query_step_pmi', async (args) => {
    const query = args as Record<string, unknown>;
    return jsonToolResult(await handleQueryStepPmi(String(query.file_path), query as never));
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CAD MCP Server started');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
