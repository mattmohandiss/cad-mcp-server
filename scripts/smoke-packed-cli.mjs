import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const smokeRoot = resolve('smoke');
const require = createRequire(join(smokeRoot, 'package.json'));
const packageRoot = join(smokeRoot, 'node_modules/cad-mcp-server');
const server = join(packageRoot, 'dist/src/index.js');
assert.ok(existsSync(server), `Packed server missing: ${server}`);

delete process.env.CAD_MCP_SIDECAR;
delete process.env.OCCT_SIDECAR;
delete process.env.CAD_MCP_SIDECAR_LAUNCHER;
delete process.env.OCCT_LAUNCHER;

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const EXPECTED_TOOLS = 5;

/**
 * Exercise the packaged artifact the way real hosts do: once with the current
 * protocol pinned, and once with a default client, which negotiates the
 * 2025-era handshake. Both must launch, expose every tool, and — when a fixture
 * is present — measure it. The second case also passes a plain filesystem path,
 * not a file: URI.
 *
 * Launch, protocol negotiation, and the tool surface are always checked. The
 * measurement assertions need a generated STEP fixture, which exists only where
 * the native fixture generator has run (`just fixture`, or `just test-integration`
 * in a full dev shell). They are skipped, not silently passed, when it is
 * absent — the same rule the PMI integration tests follow.
 */
async function smoke({ label, clientOptions, uri, unit, fixture }) {
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
    assert.equal(tools.length, EXPECTED_TOOLS, `${label}: expected ${EXPECTED_TOOLS} tools`);

    const protocol = `${client.getNegotiatedProtocolVersion()} (${client.getProtocolEra()})`;
    if (!existsSync(fixture)) {
      console.log(
        `${label}: protocol ${protocol}, tools ${tools.length} — measurement skipped ` +
          `(${fixture} absent; run \`just fixture\`)`,
      );
      return;
    }

    const result = await client.callTool({ name: 'inspect', arguments: { uri } });
    assert.equal(result.isError, undefined, `${label}: ${JSON.stringify(result)}`);
    const size = result.structuredContent?.size;
    assert.ok(size, `${label}: no size returned`);
    assert.deepEqual(
      [size.dimensions.width, size.dimensions.height, size.dimensions.depth],
      [30, 10, 10],
      `${label}: fixture dimensions changed`,
    );
    assert.ok(Math.abs(size.volume - 2000) < 1e-6, `${label}: fixture volume changed`);
    assert.ok(Math.abs(size.surface_area - 1200) < 1e-6, `${label}: fixture area changed`);
    assert.equal(size.units.length, unit, `${label}: expected ${unit} units`);
    assert.equal(result.structuredContent.artifact.units, unit, `${label}: artifact unit mismatch`);

    const faces = await client.callTool({
      name: 'find_entities',
      arguments: { artifact: result.structuredContent.artifact, entity_type: 'face', limit: 5 },
    });
    const faceIds = faces.structuredContent.entities.map((entity) => entity.id).slice(0, 1);
    const thickness = await client.callTool({
      name: 'measure',
      arguments: {
        artifact: result.structuredContent.artifact,
        kind: 'thickness',
        entity_ids: faceIds,
        direction_mode: 'normal',
        spacing: 1000,
      },
    });
    const stats = thickness.structuredContent.results[0].results.thickness.statistics;
    assert.ok(
      Math.abs(stats.min_distance - 10) < 1e-9,
      `${label}: thickness measured ${stats.min_distance}`,
    );
    console.log(
      `${label}: protocol ${protocol}, tools ${tools.length}, ` +
        `30x10x10 ${unit} fixture, thickness ${stats.min_distance} ${unit}`,
    );
  } finally {
    await client.close();
  }
}

const mm = resolve('tests/fixtures/repeated-instances.step');
const inch = resolve('tests/fixtures/repeated-instances-inch.step');

await smoke({
  label: 'modern pinned',
  clientOptions: { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  uri: pathToFileURL(mm).href,
  unit: 'mm',
  fixture: mm,
});
await smoke({
  label: 'stock client',
  clientOptions: undefined,
  uri: mm,
  unit: 'mm',
  fixture: mm,
});
await smoke({
  label: 'stock client, inch model',
  clientOptions: undefined,
  uri: inch,
  unit: 'in',
  fixture: inch,
});
