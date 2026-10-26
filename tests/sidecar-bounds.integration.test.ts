import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SidecarClient } from '../src/sidecar/client.js';
import type { SidecarInspect } from '../src/sidecar/operations.js';
import { readStepLengthUnit } from '../src/domain/step-units.js';
import { fileURLToPath } from 'node:url';

const executable = process.env['CAD_MCP_SIDECAR'];
const launcher = process.env['CAD_MCP_SIDECAR_LAUNCHER'];
const enabled = Boolean(executable && existsSync(executable));

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe.skipIf(!enabled)('sidecar bounds and material volume', () => {
  let client: SidecarClient | undefined;

  beforeAll(() => {
    client = new SidecarClient({ executable: executable!, ...(launcher ? { launcher } : {}) });
  });

  afterAll(async () => {
    await client?.stop();
  });

  const inspect = async (name: string) => {
    const path = fixture(name);
    const units = await readStepLengthUnit(path);
    const opened = await client!.request(
      'open',
      { path, systemLengthUnit: units.mmPerUnit },
      600_000,
    );
    const result = (await client!.request('inspect', { modelId: opened.result.modelId }))
      .result as SidecarInspect;
    await client!.request('close', { modelId: opened.result.modelId });
    return result;
  };

  it('bounds a partial cylinder without losing its curved extreme', async () => {
    const result = await inspect('curved-sector.step');
    const width = result.bounds.max[0]! - result.bounds.min[0]!;
    const height = result.bounds.max[1]! - result.bounds.min[1]!;
    // 20 mm diameter sector, 90 degrees, rotated so the +X extreme is interior.
    expect(width).toBeCloseTo(10, 4);
    expect(height).toBeCloseTo(20 * Math.SQRT1_2, 4);
    expect(result.boundsMethod).toBe('conservative-envelope');
  });

  it('reports no material volume for an open surface shell', async () => {
    const result = await inspect('open-shell.step');
    expect(result.solids).toBe(0);
    expect(result.shells).toBeGreaterThan(0);
    expect(result.volume).toBeNull();
    expect(result.volumeAvailable).toBe(false);
    expect(result.volumeBasis).toBe('none');
  });

  it('reads an inch-declared file in inches, not millimetres', async () => {
    const result = await inspect('repeated-instances-inch.step');
    expect(result.bounds.max[0]! - result.bounds.min[0]!).toBeCloseTo(30, 4);
    expect(result.bounds.max[1]! - result.bounds.min[1]!).toBeCloseTo(10, 4);
    expect(result.volume).toBeCloseTo(2000, 3);
  });

  it('reads a metre-declared file in metres, not millimetres', async () => {
    // The same coordinates declared in metres must read as 30 x 10 x 10 metres.
    const result = await inspect('repeated-instances-metre.step');
    expect(result.bounds.max[0]! - result.bounds.min[0]!).toBeCloseTo(30, 4);
    expect(result.bounds.max[1]! - result.bounds.min[1]!).toBeCloseTo(10, 4);
    expect(result.volume).toBeCloseTo(2000, 3);
  });
});
