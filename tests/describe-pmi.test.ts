import { describe, expect, it } from 'vitest';
import { shapePmi } from '../src/tools/describe-pmi.js';
import type {
  SidecarPmi,
  SidecarPmiDimension,
  SidecarPmiTolerance,
} from '../src/sidecar/operations.js';

/**
 * OCCT reports GD&T in millimetres, so it must be converted into the artifact's
 * declared unit before it can be compared with a measurement from the same
 * file. Missing this is a silent 25.4x error on an inch part.
 */
describe('PMI unit handling', () => {
  it('converts millimetre values into an inch model', () => {
    const shaped = shapePmi(sidecarPmi, 25.4);
    expect(shaped.dimensions[0]!.nominal).toBeCloseTo(10, 12);
    expect(shaped.dimensions[0]!.upper_deviation).toBeCloseTo(0.001, 12);
    expect(shaped.geometric_tolerances[0]!.value).toBeCloseTo(0.025, 12);
  });

  it('leaves millimetre models alone', () => {
    const shaped = shapePmi(sidecarPmi, 1);
    expect(shaped.dimensions[0]!.nominal).toBeCloseTo(254, 12);
  });
});

const diameter: SidecarPmiDimension = {
  type: 15,
  kind: 'diameter',
  nominal: 254,
  upperDeviation: 0.0254,
  lowerDeviation: 0.0254,
  entityIds: ['face:4'],
};

const range: SidecarPmiDimension = {
  type: 2,
  kind: 'linear distance',
  nominal: 31.75,
  lowerBound: 30,
  upperBound: 33,
};

const position: SidecarPmiTolerance = {
  type: 10,
  kind: 'position',
  value: 0.635,
  zoneShape: 'diameter',
  materialRequirement: 'MMC',
  valueResolved: true,
  datums: [{ name: 'A', position: 1 }],
  entityIds: ['face:9'],
};

const sidecarPmi: SidecarPmi = {
  units: { length: 'mm', note: '' },
  counts: { dimensions: 2, geometricTolerances: 1, datums: 1, presentationSkipped: 7 },
  dimensions: [diameter, range],
  geometricTolerances: [position],
  datums: [{ name: 'A', position: 1, isTarget: false }],
  warnings: [],
};

describe('PMI shaping', () => {
  it('keeps a range dimension a range, not a pair of deviations', () => {
    const shaped = shapePmi(sidecarPmi, 1).dimensions[1]!;
    expect(shaped.lower_bound).toBe(30);
    expect(shaped.upper_bound).toBe(33);
    expect(shaped.upper_deviation).toBeUndefined();
  });

  it('carries the material requirement, datum reference and entity binding', () => {
    const tolerance = shapePmi(sidecarPmi, 1).geometric_tolerances[0]!;
    expect(tolerance.material_requirement).toBe('MMC');
    expect(tolerance.zone_shape).toBe('diameter');
    expect(tolerance.datums).toEqual([{ name: 'A', position: 1 }]);
    expect(tolerance.entity_ids).toEqual(['face:9']);
  });

  it('passes an unresolved value through as unresolved rather than dropping it', () => {
    const shaped = shapePmi(
      {
        ...sidecarPmi,
        geometricTolerances: [{ ...position, valueResolved: false }],
      },
      1,
    );
    expect(shaped.geometric_tolerances[0]!.value_resolved).toBe(false);
  });
});
