import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { SidecarClient } from '../src/sidecar/client.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const launcher = process.env['CAD_MCP_SIDECAR_LAUNCHER'];
const stepPath =
  process.env['CAD_MCP_TEST_STEP_WITH_PMI'] ??
  fileURLToPath(new URL('./fixtures/repeated-instances.step', import.meta.url));
const enabled = Boolean(executable && existsSync(executable) && existsSync(stepPath));

/**
 * The op has to survive the wire and answer for a file that carries no PMI, which
 * is the common case and the one a caller most easily mistakes for a failure.
 *
 * Point `CAD_MCP_TEST_STEP_WITH_PMI` at an annotated AP242 file (the NIST MBE PMI
 * test cases work and are published for use without restriction) to exercise the
 * populated path as well.
 */
describe.skipIf(!enabled)('sidecar PMI integration', () => {
  let client: SidecarClient | undefined;
  let modelId: number | undefined;

  beforeAll(async () => {
    client = new SidecarClient({ executable: executable!, ...(launcher ? { launcher } : {}) });
    modelId = (await client.request('open', { path: stepPath }, 600_000)).result.modelId;
  }, 600_000);

  afterAll(async () => {
    if (client?.isAlive) {
      if (modelId !== undefined) await client.request('close', { modelId });
      await client.stop();
    }
  });

  it('answers with a shaped inventory rather than an error', async () => {
    const { result } = await client!.request('pmi', { modelId: modelId! });
    expect(result.units.length).toBe('mm');
    expect(Array.isArray(result.dimensions)).toBe(true);
    expect(Array.isArray(result.geometricTolerances)).toBe(true);
    expect(Array.isArray(result.datums)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    // The section counts describe the file, not the response: the graphical
    // presentation of a callout is counted separately from the callout itself.
    expect(result.counts.presentationSkipped).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.length).toBe(result.counts.dimensions);
    expect(result.geometricTolerances.length).toBe(result.counts.geometricTolerances);
  });

  it('marks any tolerance it could not value instead of reporting a false zero', async () => {
    const { result } = await client!.request('pmi', { modelId: modelId! });
    for (const tolerance of result.geometricTolerances) {
      if (tolerance.value === 0) {
        // A zero that reads as resolved carries a modifier or a zone, which is
        // what a genuine zero-at-MMC callout looks like.
        expect(tolerance.valueResolved).toBe(true);
      }
    }
    const unresolved = result.geometricTolerances.filter((t) => !t.valueResolved);
    expect(result.warnings.length).toBe(unresolved.length > 0 ? 1 : 0);
  });
});
