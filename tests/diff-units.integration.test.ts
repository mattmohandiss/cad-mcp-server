import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { handler as diff } from '../src/tools/diff.js';
import { sidecarModels } from '../src/sidecar/models.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const enabled = Boolean(executable && existsSync(executable));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe.skipIf(!enabled)('diff mixed units', () => {
  afterAll(async () => {
    await sidecarModels.close();
  });

  it('reports deltas in the baseline unit and converts the candidate', async () => {
    const result = await diff({
      baseline: { uri: fixture('repeated-instances.step') },
      candidate: { uri: fixture('repeated-instances-inch.step') },
    });
    expect(result.units).toMatchObject({ length: 'mm', area: 'mm2', volume: 'mm3' });
    expect(result.unit_note).toMatch(/Deltas are in mm/);
    expect(result.unit_note).toMatch(/candidate declares in/);
    const deltas = result.deltas as {
      dimensions: { width: number; height: number; depth: number };
      volume: number | null;
    };
    // The inch fixture is 30 x 10 x 10 in = 762 x 254 x 254 mm, versus 30 x 10 x 10 mm.
    expect(deltas.dimensions.width).toBeCloseTo(732, 4);
    expect(deltas.dimensions.height).toBeCloseTo(244, 4);
    expect(deltas.dimensions.depth).toBeCloseTo(244, 4);
    expect(deltas.volume).toBeCloseTo(32_772_128, 0);
    expect(result.inputs.map((input) => input.artifact.units)).toEqual(['mm', 'in']);
  });
});
