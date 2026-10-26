import { describe, expect, it } from 'vitest';
import { shapePmi, toModelUnit } from '../src/tools/describe-pmi.js';
import type {
  SidecarPmi,
  SidecarPmiDimension,
  SidecarPmiTolerance,
} from '../src/sidecar/operations.js';

/**
 * The sidecar reports GD&T in millimetres whatever unit the geometry was read
 * in, so a value has to be converted before it can be compared with anything
 * this server measures. Getting this wrong is a silent 25.4x error on an inch
 * part, which is why it is tested rather than trusted.
 */
describe('PMI unit conversion', () => {
  it('leaves millimetre models alone', () => {
    expect(toModelUnit(12.7, 1)).toBe(12.7);
  });

  it('converts millimetre values into an inch model', () => {
    expect(toModelUnit(12.7, 25.4)).toBeCloseTo(0.5, 12);
    expect(toModelUnit(0.2032, 25.4)).toBeCloseTo(0.008, 12);
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
  it('reports an inch model in inches, matching the drawing', () => {
    const shaped = shapePmi(sidecarPmi, 25.4);
    expect(shaped.dimensions[0]!.nominal).toBeCloseTo(10, 12);
    expect(shaped.dimensions[0]!.upper_deviation).toBeCloseTo(0.001, 12);
    expect(shaped.geometric_tolerances[0]!.value).toBeCloseTo(0.025, 12);
  });

  it('keeps a range dimension a range, not a pair of deviations', () => {
    const range = shapePmi(sidecarPmi, 1).dimensions[1]!;
    expect(range.lower_bound).toBe(30);
    expect(range.upper_bound).toBe(33);
    expect(range.upper_deviation).toBeUndefined();
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
      { ...sidecarPmi, geometricTolerances: [{ ...position, valueResolved: false }] },
      1,
    );
    expect(shaped.geometric_tolerances[0]!.value_resolved).toBe(false);
  });
});
