#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleAnalyzeStepDetail } from './tools/analyze-detail.js';
import { handleCompareStepFiles } from './tools/compare.js';
import { handleGenerateStepReport } from './tools/report.js';
import { handleInspectStepFile } from './tools/inspect.js';
import { handleQueryStepGraph } from './tools/query-graph.js';
import { isToolError } from './tools/shared.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: '0.1.0',
});

const stepFileInput = {
  file_path: z.string().min(1).describe('Absolute or relative path to the STEP file to analyze'),
};

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

const categorySchema = z.enum([
  'geometry',
  'topology',
  'structure',
  'features',
  'spatial',
  'exchange',
  'health',
]);

registerTool(
  'inspect_step_file',
  {
    title: 'Inspect STEP File',
    description:
      'Fast first-pass STEP overview with geometry, exchange metadata, health warnings, and provider limitations.',
    inputSchema: stepFileInput,
  },
  async ({ file_path }) => jsonToolResult(await handleInspectStepFile(String(file_path)))
);

registerTool(
  'analyze_step_detail',
  {
    title: 'Analyze STEP Detail',
    description: 'Detailed category-selected STEP analysis over the canonical CAD knowledge graph.',
    inputSchema: {
      ...stepFileInput,
      categories: z.array(categorySchema).optional(),
      detail_level: z.enum(['summary', 'standard', 'full']).optional(),
    },
  },
  async ({ file_path, categories, detail_level }) =>
    jsonToolResult(
      await handleAnalyzeStepDetail(
        String(file_path),
        Array.isArray(categories) ? categories : undefined,
        detail_level === 'standard' || detail_level === 'full' ? detail_level : 'summary'
      )
    )
);

registerTool(
  'query_step_graph',
  {
    title: 'Query STEP Graph',
    description: 'Run deterministic targeted queries against the CAD knowledge graph.',
    inputSchema: {
      ...stepFileInput,
      query: z.object({}).passthrough(),
    },
  },
  async ({ file_path, query }) =>
    jsonToolResult(
      await handleQueryStepGraph(
        String(file_path),
        query as Parameters<typeof handleQueryStepGraph>[1]
      )
    )
);

registerTool(
  'compare_step_files',
  {
    title: 'Compare STEP Files',
    description: 'Compare two STEP files using geometry, metadata, feature, and health deltas.',
    inputSchema: {
      file_a: z.string().min(1),
      file_b: z.string().min(1),
    },
  },
  async ({ file_a, file_b }) =>
    jsonToolResult(await handleCompareStepFiles(String(file_a), String(file_b)))
);

registerTool(
  'generate_step_report',
  {
    title: 'Generate STEP Report',
    description: 'Generate structured JSON plus Markdown report from CAD graph facts.',
    inputSchema: {
      ...stepFileInput,
      report_type: z.enum([
        'engineering_review',
        'supplier_review',
        'import_risk',
        'space_claim',
        'manufacturing_handoff',
        'pmi_audit',
      ]),
    },
  },
  async ({ file_path, report_type }) =>
    jsonToolResult(
      await handleGenerateStepReport(
        String(file_path),
        report_type as Parameters<typeof handleGenerateStepReport>[1]
      )
    )
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
