import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { expect, it } from 'vitest';

it('serves discovery and tools over the modern MCP protocol', async () => {
  const client = new Client(
    { name: 'cad-mcp-protocol-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    expect(client.getProtocolEra()).toBe('modern');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'diff',
      'find_entities',
      'inspect',
      'measure',
    ]);
  } finally {
    await client.close();
  }
});

it('serves the 2025-era handshake that stock MCP hosts negotiate', async () => {
  // No version pin: this is what an off-the-shelf client sends by default.
  const client = new Client({ name: 'cad-mcp-protocol-legacy-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    expect(client.getProtocolEra()).toBe('legacy');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'diff',
      'find_entities',
      'inspect',
      'measure',
    ]);
  } finally {
    await client.close();
  }
});
