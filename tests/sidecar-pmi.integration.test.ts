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
    const unresolvedTolerances = result.geometricTolerances.filter((t) => !t.valueResolved);
    const unresolvedDimensions = result.dimensions.filter((d) => !d.valueResolved);
    expect(result.counts.datumReferences).toBeGreaterThanOrEqual(result.counts.uniqueDatums);
    if (unresolvedTolerances.length + unresolvedDimensions.length > 0) {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it('never leaves a dimension value looking resolved when there is nothing to compare against', async () => {
    const { result } = await client!.request('pmi', { modelId: modelId! });
    for (const dimension of result.dimensions) {
      // The flag is the only thing standing between a caller and a comparison
      // against a nominal that was never read: an unread magnitude and a genuine
      // zero callout are the same 0.0 on the wire.
      const readable = dimension.nominal !== 0 || dimension.toleranceForm !== 'none';
      expect(dimension.valueResolved).toBe(readable);
      expect(['plus-minus', 'range', 'class', 'none']).toContain(dimension.toleranceForm);
    }
  });

  it('locates the shapes a datum is attached to, so a tolerance naming it can be checked', async () => {
    const { result } = await client!.request('pmi', { modelId: modelId! });
    for (const tolerance of result.geometricTolerances) {
      for (const datum of tolerance.datums ?? []) {
        expect(typeof datum.name).toBe('string');
        expect(datum.position).toBeGreaterThan(0);
        // A datum that could not be placed is reported without entity IDs rather
        // than with a guess, so this only checks what is present is well formed.
        for (const id of datum.entityIds ?? []) expect(id).toMatch(/^(face|edge):\d+$/);
      }
    }
  });
});
