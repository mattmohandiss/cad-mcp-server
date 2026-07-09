#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import pkg from '../package.json' with { type: 'json' };
import { queryHelpResourceHandler, QUERY_HELP_URI } from './resources/query-help.js';
import { TOOL_REGISTRY } from './tools/registry.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} as const;

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  serveStdio(() => {
    const server = new McpServer({
      name: 'cad-mcp-server',
      version: pkg.version,
    });

    for (const tool of TOOL_REGISTRY) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.schema,
          annotations: READ_ONLY,
        },
        tool.handler,
      );
    }

    server.registerResource(
      'query-help',
      QUERY_HELP_URI,
      {
        title: 'CAD MCP query help',
        description:
          'Schema reference for all 8 tools: filters, include presets, summaries, measurements, and examples. Fetched on demand by the LLM client.',
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
  });

  console.error('CAD MCP Server started (8-tool surface)');
}
