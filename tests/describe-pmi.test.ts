import { describe, expect, it } from 'vitest';
import { pmiKind, shapePmi } from '../src/tools/describe-pmi.js';
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
  valueResolved: true,
  toleranceForm: 'plus-minus',
  upperDeviation: 0.0254,
  lowerDeviation: 0.0254,
  entityIds: ['face:4'],
};

const range: SidecarPmiDimension = {
  type: 2,
  kind: 'linear distance',
  nominal: 31.75,
  valueResolved: true,
  toleranceForm: 'range',
  lowerBound: 30,
  upperBound: 33,
};

/** A basic location dimension defining a tolerance frame: readable, but valueless. */
const basicLocation: SidecarPmiDimension = {
  type: 1,
  kind: 'linear distance',
  nominal: 0,
  valueResolved: false,
  toleranceForm: 'none',
  entityIds: ['face:41'],
  secondaryEntityIds: ['face:37'],
};

const position: SidecarPmiTolerance = {
  type: 10,
  kind: 'position',
  value: 0.635,
  zoneShape: 'diameter',
  materialRequirement: 'MMC',
  valueResolved: true,
  datums: [{ name: 'A', position: 1, entityIds: ['face:1'] }],
  entityIds: ['face:9'],
};

const sidecarPmi: SidecarPmi = {
  units: { length: 'mm', note: '' },
  counts: {
    dimensions: 2,
    geometricTolerances: 1,
    datumReferences: 1,
    uniqueDatums: 1,
    presentationSkipped: 7,
  },
  dimensions: [diameter, range],
  geometricTolerances: [position],
  datums: [{ name: 'A', position: 1, isTarget: false, entityIds: ['face:1'] }],
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
    expect(tolerance.datums).toEqual([{ name: 'A', position: 1, entity_ids: ['face:1'] }]);
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

  it('names the datum references that could not be attached to geometry', () => {
    // OCCT reads a datum's shape from a `geometric_item_specific_usage` but not from an
    // `item_identified_representation_usage`, so a frame can name a datum that has no
    // faces. That is the difference between "not checked" and "not checkable".
    const shaped = shapePmi(
      {
        ...sidecarPmi,
        geometricTolerances: [
          {
            ...position,
            datums: [
              { name: 'A', position: 1, entityIds: ['face:1'] },
              { name: 'B', position: 2 },
              { name: 'C', position: 3 },
            ],
          },
        ],
      },
      1,
    );
    const tolerance = shaped.geometric_tolerances[0]!;
    expect(tolerance.unlocated_datums).toEqual(['B', 'C']);
    expect(tolerance.datums).toEqual([
      { name: 'A', position: 1, entity_ids: ['face:1'] },
      { name: 'B', position: 2 },
      { name: 'C', position: 3 },
    ]);
  });

  it('says nothing about unlocated datums when every reference was located', () => {
    const shaped = shapePmi(sidecarPmi, 1);
    expect(shaped.geometric_tolerances[0]).not.toHaveProperty('unlocated_datums');
  });

  it('marks a valueless dimension unresolved instead of reporting a nominal of zero', () => {
    const shaped = shapePmi({ ...sidecarPmi, dimensions: [diameter, basicLocation] }, 1)
      .dimensions[1]!;
    // A caller that ignores this compares a measurement against 0.0 and calls it a
    // violation, so the flag has to survive shaping.
    expect(shaped.value_resolved).toBe(false);
    expect(shaped.tolerance_form).toBe('none');
    expect(shaped.nominal).toBe(0);
    expect(shaped.entity_ids).toEqual(['face:41']);
    expect(shaped.secondary_entity_ids).toEqual(['face:37']);
  });

  it('carries the tolerance form and the datum shape binding', () => {
    const shaped = shapePmi(sidecarPmi, 1);
    expect(shaped.dimensions.map((dimension) => dimension.tolerance_form)).toEqual([
      'plus-minus',
      'range',
    ]);
    expect(shaped.datums[0]!.entity_ids).toEqual(['face:1']);
  });
});

describe('what an empty section means', () => {
  it('separates readable callouts, drawn callouts, and none at all', () => {
    // One readable callout makes the file semantic.
    expect(pmiKind(1, 0)).toBe('semantic');
    expect(pmiKind(12, 9)).toBe('semantic');
    // Drawn but unreadable: the same geometry as the semantic fixture above, exported the
    // other way. Reporting this as "declares no PMI" is the confident wrong answer.
    expect(pmiKind(0, 21)).toBe('graphical-only');
    // Nothing declared, nothing drawn.
    expect(pmiKind(0, 0)).toBe('none');
  });
});
