#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import pkg from '../package.json' with { type: 'json' };
import { createViewerApiToken, startViewerArtifactApi } from './artifacts/viewer-api.js';
import { queryHelpResourceHandler, QUERY_HELP_URI } from './resources/query-help.js';
import { TOOL_REGISTRY } from './tools/registry.js';
import { logEvent } from './logging.js';
import { sidecarModels } from './sidecar/models.js';

// All cad-mcp tools are pure geometry reads: they do not modify anything and
// operate on the closed world of the given STEP file (no external side effects).
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const CAD_CAPABILITY_MANIFEST = {
  capabilityId: 'cad-core',
  version: pkg.version,
  title: 'CAD Geometry Facts',
  domain: 'geometry',
  workflows: ['inspect', 'find_entities', 'measure', 'diff'],
  subjects: ['geometry', 'assembly'],
  resultKinds: ['facts', 'comparison'],
  requiredInputs: ['file_path'],
  sideEffects: [],
  dataHandling: { processing: 'local' },
  // This server is read-only and understands geometry only. The companion
  // review-mcp server registers the 8 engineering workflow prompts
  // (analyze_part, check_thickness, check_moldability, draft_audit, etc.) that
  // orchestrate these tools; a capability-aware host should look there for the
  // interpretation surface.
  promptsHostedBy: 'review-mcp',
};

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let viewerApi: Awaited<ReturnType<typeof startViewerArtifactApi>> | undefined;
  if (getArgValue('--viewer-api') === 'http') {
    const port = Number(getArgValue('--viewer-port') ?? '0');
    const token = getArgValue('--viewer-token') ?? createViewerApiToken();
    viewerApi = await startViewerArtifactApi({ port, token });
    logEvent('artifact_api.started', { endpoint: viewerApi.endpoint });
  }

  const mcpHandle = serveStdio(
    () => {
      const server = new McpServer(
        {
          name: 'cad-mcp-server',
          version: pkg.version,
        },
        { capabilities: { tools: {}, resources: {} } },
      );

      for (const tool of TOOL_REGISTRY) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.schema,
            outputSchema: tool.outputSchema,
            annotations: READ_ONLY,
          },
          // The registry intentionally contains heterogeneous tool schemas.
          // MCP validates each tool's input before this adapter runs.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (args: any) => {
            const startedAt = Date.now();
            logEvent('tool.started', { tool: tool.name });
            const result = await tool.handler(args);
            logEvent('tool.completed', {
              tool: tool.name,
              durationMs: Date.now() - startedAt,
              isError: 'isError' in result && result.isError === true,
            });
            return result;
          },
        );
      }

      server.registerResource(
        'query-help',
        QUERY_HELP_URI,
        {
          title: 'CAD MCP query help',
          description:
            'Schema reference for all public tools: filters, include presets, summaries, measurements, and examples. Fetched on demand by the LLM client.',
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

      server.registerResource(
        'cad-core-capability',
        'mcp-capability://cad-core',
        {
          title: 'CAD Core Capability',
          description: 'Capability manifest for deterministic STEP geometry facts.',
          mimeType: 'application/json',
          annotations: {
            audience: ['user', 'assistant'],
            priority: 0.8,
          },
        },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(CAD_CAPABILITY_MANIFEST),
            },
          ],
        }),
      );

      return server;
    },
    { legacy: 'reject' },
  );

  let closePromise: Promise<void> | undefined;
  const close = () => {
    closePromise ??= (async () => {
      await mcpHandle.close();
      await viewerApi?.close();
      await sidecarModels.close();
    })();
    return closePromise;
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  process.stdin.once('end', () => void close());

  logEvent('server.started', { tools: TOOL_REGISTRY.length, protocol: '2026-07-28' });
}
