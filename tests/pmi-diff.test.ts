import { describe, expect, it } from 'vitest';
import { comparePmi } from '../src/domain/compare.js';
import type { SidecarPmi, SidecarPmiTolerance } from '../src/sidecar/operations.js';

/**
 * A revision that silently drops callouts is a design-intent change that no
 * geometry delta reports, so `diff` counts PMI on both sides. Counts only: whether
 * a tolerance is *met* is not a file fact.
 */
function pmi(
  counts: { dimensions: number; tolerances: number; datums: number; datumReferences?: number },
  tolerances: SidecarPmiTolerance[] = [],
): SidecarPmi {
  return {
    units: { length: 'mm', note: '' },
    counts: {
      dimensions: counts.dimensions,
      geometricTolerances: counts.tolerances,
      datumReferences: counts.datumReferences ?? counts.datums,
      uniqueDatums: counts.datums,
      presentationSkipped: 0,
    },
    dimensions: [],
    geometricTolerances: tolerances,
    datums: [],
    warnings: [],
  };
}

const tolerance = (valueResolved: boolean): SidecarPmiTolerance => ({
  type: 10,
  kind: 'position',
  value: 0.2,
  zoneShape: 'diameter',
  materialRequirement: 'none',
  valueResolved,
});

describe('PMI revision comparison', () => {
  it('reports callouts added and dropped between revisions', () => {
    const before = pmi({ dimensions: 4, tolerances: 2, datums: 1 });
    const after = pmi({ dimensions: 5, tolerances: 0, datums: 2 });
    const comparison = comparePmi(before, after);
    expect(comparison.deltas).toEqual({
      dimensions: 1,
      geometric_tolerances: -2,
      datums: 1,
      datum_references: 1,
    });
    expect(comparison.baseline).toMatchObject({ geometric_tolerances: 2 });
    expect(comparison.candidate).toMatchObject({ geometric_tolerances: 0 });
  });

  it('reports a revision that declares no PMI as a drop, not as missing data', () => {
    const comparison = comparePmi(
      pmi({ dimensions: 3, tolerances: 4, datums: 2 }),
      pmi({ dimensions: 0, tolerances: 0, datums: 0 }),
    );
    expect(comparison.deltas.geometric_tolerances).toBe(-4);
  });

  it('keeps unreadable tolerance values visible so a count cannot overstate', () => {
    const comparison = comparePmi(
      pmi({ dimensions: 1, tolerances: 2, datums: 1 }, [tolerance(true), tolerance(false)]),
      pmi({ dimensions: 1, tolerances: 2, datums: 1 }),
    );
    expect(comparison.baseline.unresolved_values).toBe(1);
    expect(comparison.candidate.unresolved_values).toBe(0);
  });
});
