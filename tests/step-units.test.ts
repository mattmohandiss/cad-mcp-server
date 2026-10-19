import { describe, expect, it } from 'vitest';
import { detectStepLengthUnit } from '../src/domain/step-units.js';

describe('STEP length unit detection', () => {
  it('reads millimetres', () => {
    const text = '#24 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );';
    expect(detectStepLengthUnit(text)).toEqual({ name: 'mm', mmPerUnit: 1 });
  });

  it('reads metres', () => {
    expect(detectStepLengthUnit('SI_UNIT($,.METRE.)')).toEqual({ name: 'm', mmPerUnit: 1000 });
    expect(detectStepLengthUnit('SI_UNIT(.CENTI.,.METRE.)')).toEqual({ name: 'cm', mmPerUnit: 10 });
  });

  it('reads a conversion-based inch unit', () => {
    const text = [
      "#24 = ( CONVERSION_BASED_UNIT('INCH',#900) LENGTH_UNIT() NAMED_UNIT(#901) );",
      '#900 = MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#902);',
      '#902 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );',
    ].join('\n');
    expect(detectStepLengthUnit(text)).toEqual({ name: 'in', mmPerUnit: 25.4 });
  });

  it('reads a conversion-based foot unit', () => {
    const text = [
      "#5 = ( CONVERSION_BASED_UNIT('FOOT',#6) LENGTH_UNIT() NAMED_UNIT(#7) );",
      '#6 = MEASURE_WITH_UNIT(LENGTH_MEASURE(304.8),#8);',
      '#8 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );',
    ].join('\n');
    expect(detectStepLengthUnit(text)).toEqual({ name: 'ft', mmPerUnit: 304.8 });
  });

  it('falls back to millimetres when no unit is declared', () => {
    expect(detectStepLengthUnit('ISO-10303-21;')).toEqual({ name: 'mm', mmPerUnit: 1 });
  });
});
