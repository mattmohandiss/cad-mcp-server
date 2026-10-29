import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { handler } from '../src/tools/describe-pmi.js';
import type { Characteristic } from '../src/domain/pmi-characteristics.js';

/**
 * The join, against a file that really declares requirements.
 *
 * `nist_ctc_01_asme1_ap242-e1.stp` declares a Ø35 +0/−0.2 on two cylindrical faces that
 * measure 35.0000000000002, so this has a known answer rather than a shape assertion. It
 * also declares four dimensions with no readable value, two of which are basic dimensions
 * defining the position frames — the cases where a join that trusts its input reports a
 * violation that does not exist.
 *
 * It runs through the tool handler, not the sidecar, because the comparison is the tool's
 * job: the sidecar reports callouts and faces, and knows nothing about tolerances.
 */
const enabled = Boolean(
  process.env['CAD_MCP_SIDECAR'] &&
  existsSync(fileURLToPath(new URL('./fixtures/nist_ctc_01_asme1_ap242-e1.stp', import.meta.url))),
);

type PmiReport = {
  characteristics?: Characteristic[];
  dimensions?: unknown[];
  counts?: { dimensions: number; geometric_tolerances: number; presentation_skipped: number };
  pmi_kind?: string;
  warnings?: string[];
};

/** One fixture as the tool takes it. */
function fixtureUri(name: string): string {
  return `file://${fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))}`;
}

describe.skipIf(!enabled)('what an empty section means', () => {
  it('tells drawn requirements apart from encoded ones and from none at all', async () => {
    // The same part, exported three ways. The middle case is the common one in real work
    // — requirements that exist as graphics — and reporting it as "declares nothing" is
    // the confident wrong answer this distinction exists to prevent.
    const semantic = (await handler({
      uri: fixtureUri('nist_ctc_01_asme1_ap242-e1.stp'),
    })) as unknown as PmiReport;
    expect(semantic.pmi_kind).toBe('semantic');
    expect(semantic.counts?.dimensions).toBeGreaterThan(0);

    const drawn = (await handler({
      uri: fixtureUri('nist_ctc_01_asme1_ap203-graphical.stp'),
    })) as unknown as PmiReport;
    expect(drawn.pmi_kind).toBe('graphical-only');
    expect(drawn.counts?.dimensions).toBe(0);
    expect(drawn.counts?.geometric_tolerances).toBe(0);
    expect(drawn.counts?.presentation_skipped).toBeGreaterThan(0);
    expect(drawn.warnings?.join(' ')).toContain('graphical presentation');

    const bare = (await handler({
      uri: fixtureUri('nist_ctc_01_asme1_ap203-geometry.stp'),
    })) as unknown as PmiReport;
    expect(bare.pmi_kind).toBe('none');
    expect(bare.counts?.presentation_skipped).toBe(0);
    // Nothing declared and nothing drawn is not worth a warning; the drawn case is.
    expect(bare.warnings).toEqual([]);
  });
});

describe.skipIf(!enabled)('PMI join against a real AP242 file', () => {
  const uri = `file://${fileURLToPath(new URL('./fixtures/nist_ctc_01_asme1_ap242-e1.stp', import.meta.url))}`;

  it('satisfies the diameters it can read, against the values the file declares', async () => {
    const report = (await handler({ uri })) as unknown as PmiReport;
    const rows = report.characteristics ?? [];
    expect(rows.length).toBeGreaterThan(0);

    const diameters = rows.filter((row) => row.requirement.startsWith('diameter 35'));
    expect(diameters.length).toBeGreaterThan(0);
    // The declared upper deviation is 0 and the model measures 35.0000000000002, so this
    // is at the limit and not past it. A violation here would be float noise, not a defect.
    expect(diameters.every((row) => row.state === 'satisfied')).toBe(true);
    for (const row of diameters) {
      expect(row.measured).toBeCloseTo(35, 6);
      expect(row.nominal).toBe(35);
    }

    // Nothing in this file disagrees with its own callouts.
    expect(rows.filter((row) => row.state === 'violated')).toEqual([]);
  });

  it('never checks a callout it could not read, and says which case it is', async () => {
    const report = (await handler({ uri })) as unknown as PmiReport;
    const rows = report.characteristics ?? [];

    // Every row that is not a verdict carries a reason, so the caller can tell a missing
    // input from a failed check.
    for (const row of rows) {
      if (row.state !== 'satisfied' && row.state !== 'violated') expect(row.reason).toBeDefined();
    }
    // The two location dimensions that define the position frames are not requirements.
    const basic = rows.filter((row) => row.reason === 'basic-dimension');
    expect(basic.length).toBe(2);
    expect(basic.every((row) => row.state === 'not-applicable')).toBe(true);

    // No row is a verdict about a nominal that was never read: the unreadable location
    // dimensions are basic dimensions and are excluded, and the duplicate objects collapse
    // into the callouts that do carry a value.
    expect(rows.filter((row) => row.reason === 'value-unresolved')).toEqual([]);
    for (const row of rows) {
      if (row.state === 'satisfied' || row.state === 'violated') {
        expect(row.nominal).toBeGreaterThan(0);
        expect(row.measured).toBeDefined();
      }
    }
  });

  it('names the datums that block a tolerance, so the gap is not silence', async () => {
    const report = (await handler({ uri })) as unknown as {
      geometric_tolerances?: {
        kind: string;
        datums?: { name: string; entity_ids?: string[] }[];
        unlocated_datums?: string[];
      }[];
    };
    const tolerances = report.geometric_tolerances ?? [];
    // Datum A is attached to a face in this file; B and C are stated through a
    // representation item that OCCT does not attach, so every frame naming them is
    // blocked. Naming them is the whole point: the engineer can supply the frame, but
    // only if they are told which part of it is missing.
    const blocked = tolerances.filter((tolerance) => tolerance.unlocated_datums !== undefined);
    expect(blocked.length).toBe(3);
    for (const tolerance of blocked) expect(tolerance.unlocated_datums).toEqual(['B', 'C']);

    // The single-datum tolerances and the one with no datum at all are not blocked by this.
    const free = tolerances.filter((tolerance) => tolerance.unlocated_datums === undefined);
    expect(free.length).toBe(3);
    for (const tolerance of free) {
      for (const datum of tolerance.datums ?? []) expect(datum.entity_ids).toBeDefined();
    }
  });

  it('accounts for every callout it was given', async () => {
    const report = (await handler({ uri })) as unknown as PmiReport;
    const rows = report.characteristics ?? [];
    // Each row is one callout, and no row is dropped: a callout either has a verdict or a
    // stated reason. Duplicates collapse, which is why this is not a count of dimensions.
    expect(rows.length).toBeLessThanOrEqual((report.dimensions ?? []).length);
    expect(rows.length).toBeGreaterThan(0);
  });
});
