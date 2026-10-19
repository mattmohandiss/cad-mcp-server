import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const smokeRoot = resolve('smoke');
const require = createRequire(join(smokeRoot, 'package.json'));
const packageRoot = join(smokeRoot, 'node_modules/cad-mcp-server');
const server = join(packageRoot, 'dist/src/index.js');
const fixture = resolve('tests/fixtures/repeated-instances.step');
assert.ok(require('node:fs').existsSync(server), `Packed server missing: ${server}`);
assert.ok(require('node:fs').existsSync(fixture), `STEP fixture missing: ${fixture}`);

delete process.env.CAD_MCP_SIDECAR;
delete process.env.OCCT_SIDECAR;
delete process.env.CAD_MCP_SIDECAR_LAUNCHER;
delete process.env.OCCT_LAUNCHER;

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

/**
 * Exercise the packaged artifact the way real hosts do: once with the current
 * protocol pinned, and once with a default client, which negotiates the
 * 2025-era handshake. Both must expose the tools and measure the fixture. The
 * second case also passes a plain filesystem path, not a file: URI.
 */
async function smoke({ label, clientOptions, uri }) {
  const client = new Client({ name: 'cad-mcp-pack-smoke', version: '1.0.0' }, clientOptions);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    cwd: process.cwd(),
    stderr: 'inherit',
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4, `${label}: expected four tools`);
    const result = await client.callTool({ name: 'inspect', arguments: { uri } });
    assert.equal(result.isError, undefined, `${label}: ${JSON.stringify(result)}`);
    const dimensions = result.structuredContent?.size?.dimensions;
    assert.ok(dimensions, `${label}: no dimensions returned`);
    assert.ok(
      [dimensions.width, dimensions.height, dimensions.depth].every(
        (value) => Number.isFinite(value) && value > 0,
      ),
      `${label}: invalid dimensions`,
    );
    console.log(
      `${label}: protocol ${client.getNegotiatedProtocolVersion()} (${client.getProtocolEra()}), ` +
        `tools ${tools.length}, inspected ${dimensions.width}x${dimensions.height}x${dimensions.depth}`,
    );
  } finally {
    await client.close();
  }
}

await smoke({
  label: 'modern pinned',
  clientOptions: { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  uri: pathToFileURL(fixture).href,
});
await smoke({
  label: 'stock client',
  clientOptions: undefined,
  uri: fixture,
});
