#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CAD_MCP_SERVER_VERSION } from './schema-version.js';
import {
  inspectStepInput,
  handleInspectStep,
} from './tools/inspect.js';
import {
  queryStepInput,
  handleQueryStep,
} from './tools/query.js';
import {
  diffStepInput,
  handleDiffStep,
} from './tools/diff.js';
import {
  transactStepInput,
  handleTransactStep,
} from './tools/transact.js';
import { queryHelpResourceHandler, QUERY_HELP_URI } from './resources/query-help.js';
import { toolExamples } from './schemas/examples.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: CAD_MCP_SERVER_VERSION,
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

type StepToolResult = ReturnType<typeof jsonToolResult> | Promise<ReturnType<typeof jsonToolResult>>;
type RegisterTool = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodType>;
    outputSchema?: Record<string, z.ZodType> | z.ZodTypeAny;
  },
  callback: (args: Record<string, unknown>) => StepToolResult,
) => unknown;

const registerTool = server.registerTool.bind(server) as RegisterTool;

function withErrorContext(
  toolName: string,
  handler: (args: Record<string, unknown>) => StepToolResult,
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

/* ------------------------------------------------------------------ */
/*  Tool registrations — 4-tool surface                                */
/* ------------------------------------------------------------------ */

registerTool(
  'inspect_step',
  {
    title: 'Inspect STEP File',
    description:
      'Use this FIRST when given a STEP file to inspect. Returns a compact summary: bounding box (AABB and OBB), watertight status, body/solid/face/edge/vertex counts, global properties (volume, surface area, center of mass, inertia, principal axes), per-subshape validity, tolerance statistics, and XDE metadata (assembly tree, PMI summary, color/layer/material presence). If the part is invalid, returns a structured list of which sub-shapes failed and why — the LLM gets actionable information, not a boolean. Don\'t use for entity-level searches; use query_step for that.',
    inputSchema: inspectStepInput.shape,
  },
  withErrorContext('inspect_step', async (args) => {
    const parsed = inspectStepInput.parse(args);
    return jsonToolResult(await handleInspectStep(parsed));
  }),
);

registerTool(
  'query_step',
  {
    title: 'Query STEP (declarative)',
    description:
      'Declarative query over a STEP file\'s geometric, topological, and XDE entities. Specify which entity type to query (faces, edges, bodies, vertices, pmi, color, layer, material, assembly_node), filter by properties, optionally group by a shared dimension (axis, normal, surface type, etc.), measure derived values per entity or per group (ray tests, distances, curvature, section, continuity), and aggregate statistics (count, min, max, avg) over the result set. Use group_by to cluster entities that share a property — the operation find_coaxial_cylinders used to do is now {entities: "faces", filter: {surface_type: "cylinder"}, group_by: ["axis"]}. The result is one call instead of the 5+ round-trips that primitive-only tools require, and intermediate state stays on the server (set return_intermediate: true for debugging). For multi-step workflows that need iteration across result sets ("for each hole, ray-test, then filter"), use transact_step instead.',
    inputSchema: queryStepInput.shape,
  },
  withErrorContext('query_step', async (args) => {
    const parsed = queryStepInput.parse(args);
    return jsonToolResult(await handleQueryStep(parsed));
  }),
);

registerTool(
  'diff_step',
  {
    title: 'Diff STEP Files',
    description:
      'Compare two STEP files and return metric deltas, topology changes, body-level changes, and XDE-level changes (PMI, colors, materials, assembly). Use this to compare two revisions of a part when you need factual differences in dimensions, volume, area, topology counts, or exchange metadata. Does NOT track feature identity across revisions — a hole that moved is "hole removed + hole added," not "hole moved." Deltas are comparison_file_path minus baseline_file_path.',
    inputSchema: diffStepInput.shape,
  },
  withErrorContext('diff_step', async (args) => {
    const parsed = diffStepInput.parse(args);
    return jsonToolResult(await handleDiffStep(parsed));
  }),
);

registerTool(
  'transact_step',
  {
    title: 'Transact STEP (pipeline)',
    description:
      'Run a multi-step workflow that needs iteration across result sets — for example, "for each hole, ray-test in +Z, then find ones where the ray didn\'t come out the other side." Each pipeline is a sequence of typed operations. The vocabulary is small: query (re-uses the query_step shape), for_each (apply a sub-pipeline to each item), filter_results (keep items where a condition holds), select (project to specific fields), and walk_assembly (XDE: traverse the assembly tree). Use this only when a single query_step call cannot express the workflow; for declarative queries, prefer query_step. Intermediate results are hidden by default; set return_intermediate: true to debug.',
    inputSchema: transactStepInput.shape,
  },
  withErrorContext('transact_step', async (args) => {
    const parsed = transactStepInput.parse(args);
    return jsonToolResult(await handleTransactStep(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  Resource registrations                                              */
/* ------------------------------------------------------------------ */

server.registerResource(
  'query-help',
  QUERY_HELP_URI,
  {
    title: 'CAD MCP query help',
    description:
      'Schema reference, measure op vocabulary, group_by dimensions, filter fields per entity type, and 6+4 input_examples for the query_step and transact_step tools. Fetched on demand by the LLM client to discover the surface.',
    mimeType: 'application/json',
  },
  async () => {
    const content = queryHelpResourceHandler();
    return {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
        },
      ],
    };
  },
);

/* ------------------------------------------------------------------ */
/*  Input examples — also exposed via tool definitions                 */
/* ------------------------------------------------------------------ */

// Surface the input_examples via a tools/list extension. MCP doesn't
// have a direct mechanism for examples; clients that want them should
// fetch cad-mcp://query-help instead.
void toolExamples; // referenced to keep the import side-effect explicit

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CAD MCP Server started (4-tool surface)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
