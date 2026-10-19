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
import { runTool } from './tool-helper.js';
import { SERVER_NAME, CACHE_TTL_MS } from './identity.js';
import { sidecarModels } from './sidecar/models.js';

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
        { name: SERVER_NAME, version: pkg.version },
        {
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          instructions:
            'Local STEP geometry server. Call inspect first for a SHA-256 artifact reference, then find_entities and measure with the exact returned entity IDs. Returns measured geometry facts, never manufacturability or design-intent conclusions.',
          cacheHints: {
            'server/discover': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
            'tools/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
            'resources/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
            'resources/read': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
          },
        },
      );

      for (const tool of TOOL_REGISTRY) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations: tool.annotations,
          },
          // The registry intentionally contains heterogeneous tool schemas.
          // MCP validates each tool's input before this adapter runs.
          (args: unknown) => runTool(tool.name, () => tool.handler(args)),
        );
      }

      server.registerResource(
        'help',
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

      return server;
    },
    // Serve the 2025-era handshake as well: stock MCP hosts negotiate
    // 2025-11-25, and the same factory serves both eras.
    { legacy: 'serve' },
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

  logEvent('server.started', { tools: TOOL_REGISTRY.length });
}
