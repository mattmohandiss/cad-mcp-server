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
const client = new Client(
  { name: 'cad-mcp-pack-smoke', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  cwd: process.cwd(),
  stderr: 'inherit',
});
try {
  await client.connect(transport);
  assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
  const result = await client.callTool({
    name: 'inspect',
    arguments: { uri: pathToFileURL(fixture).href },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const dimensions = result.structuredContent?.size?.dimensions;
  assert.ok(dimensions, 'Packaged MCP server returned no dimensions');
  assert.ok(
    [dimensions.width, dimensions.height, dimensions.depth].every(
      (value) => Number.isFinite(value) && value > 0,
    ),
    'Packaged MCP server returned invalid dimensions',
  );
  console.log('Packed npm CLI launched its sidecar and inspected the STEP fixture');
} finally {
  await client.close();
}
