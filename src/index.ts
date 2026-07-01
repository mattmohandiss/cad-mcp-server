#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CAD_MCP_SERVER_VERSION } from './schema-version.js';
import { inspectStepInput, handleInspectStep } from './tools/inspect.js';
import { queryFacesInput, handleQueryFaces } from './tools/query-faces.js';
import { queryEdgesInput, handleQueryEdges } from './tools/query-edges.js';
import { handleMeasureStep } from './tools/measure.js';
import { diffStepInput, handleDiffStep } from './tools/diff.js';
import { queryHelpResourceHandler, QUERY_HELP_URI } from './resources/query-help.js';
import {
  inspectStepInputSchema,
  queryFacesInputSchema,
  queryEdgesInputSchema,
  measureStepInputSchema,
  diffStepInputSchema,
} from './schemas/tool-schemas.js';
import type { MeasureStepInput } from './schemas/tool-schemas.js';
import { toolExamples } from './schemas/examples.js';

const server = new McpServer({
  name: 'cad-mcp-server',
  version: CAD_MCP_SERVER_VERSION,
});

type ToolResponse<T> =
  { ok: true; data: T } | { ok: false; error: { type: string; message: string } };

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
  ReturnType<typeof jsonToolResult> | Promise<ReturnType<typeof jsonToolResult>>;
type RegisterTool = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodType> | z.ZodTypeAny;
    outputSchema?: Record<string, z.ZodType> | z.ZodTypeAny;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
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
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((issue) => {
          const path = issue.path.join('.');
          const hint =
            issue.code === 'too_small'
              ? `. Omit this field entirely if you don't need to constrain it; do not pass an empty array [] or object.`
              : '';
          return `${path}: ${issue.message}${hint}`;
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid arguments for tool ${toolName}:\n${messages.join('\n')}`,
            },
          ],
          isError: true,
        };
      }
      console.error(`Tool ${toolName} failed:`, error);
      throw error;
    }
  };
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};

/* ------------------------------------------------------------------ */
/*  inspect_step                                                       */
/* ------------------------------------------------------------------ */

registerTool(
  'inspect_step',
  {
    title: 'Inspect STEP File',
    description:
      "Use this FIRST for a model overview. Returns bounding box, volume, surface area, center of mass, body/face/edge counts, watertight status, validity, PMI presence, and assembly structure. Don't use for entity searches; use query_faces or query_edges for that.",
    inputSchema: inspectStepInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  withErrorContext('inspect_step', async (args) => {
    const parsed = inspectStepInput.parse(args);
    return jsonToolResult(await handleInspectStep(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  query_faces                                                        */
/* ------------------------------------------------------------------ */

registerTool(
  'query_faces',
  {
    title: 'Query Faces',
    description:
      'Find faces by type, area, or radius. Returns IDs, surface types, areas, radii, diameters, axes, normals. Use returned IDs in measure_step for measurements.',
    inputSchema: queryFacesInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  withErrorContext('query_faces', async (args) => {
    const parsed = queryFacesInput.parse(args);
    return jsonToolResult(await handleQueryFaces(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  query_edges                                                        */
/* ------------------------------------------------------------------ */

registerTool(
  'query_edges',
  {
    title: 'Query Edges',
    description:
      'Find edges by curve type, length, or radius. Returns IDs, curve types, lengths, radii, diameters. Use returned IDs in measure_step for measurements.',
    inputSchema: queryEdgesInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  withErrorContext('query_edges', async (args) => {
    const parsed = queryEdgesInput.parse(args);
    return jsonToolResult(await handleQueryEdges(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  measure_step                                                       */
/* ------------------------------------------------------------------ */

registerTool(
  'measure_step',
  {
    title: 'Measure Geometry',
    description:
      'Run measurements on faces or edges using IDs from query_faces/query_edges. Supports batch measurement. Ops: ray_test, ray_test_grid (wall thickness), ray_test_segment, distance, draft_angle, closest_point_on_face, classify_point. Direction shortcuts: along_axis, along_axis_both, normal.',
    inputSchema: measureStepInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  withErrorContext('measure_step', async (args) => {
    const parsed = measureStepInputSchema.parse(args) as MeasureStepInput;
    return jsonToolResult(await handleMeasureStep(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  diff_step                                                          */
/* ------------------------------------------------------------------ */

registerTool(
  'diff_step',
  {
    title: 'Diff STEP Files',
    description:
      'Compare two STEP files. Returns deltas: volume, surface area, dimensions, face/edge/body counts. Comparison minus baseline.',
    inputSchema: diffStepInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  withErrorContext('diff_step', async (args) => {
    const parsed = diffStepInput.parse(args);
    return jsonToolResult(await handleDiffStep(parsed));
  }),
);

/* ------------------------------------------------------------------ */
/*  query-help resource                                                */
/* ------------------------------------------------------------------ */

server.registerResource(
  'query-help',
  QUERY_HELP_URI,
  {
    title: 'CAD MCP query help',
    description:
      'Schema reference for query_faces, query_edges, and measure_step: supported surface types, curve types, where fields, select fields, group_by dimensions, measure ops, and examples. Fetched on demand by the LLM client.',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.9,
    },
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

void toolExamples;

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CAD MCP Server started (5-tool surface)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
