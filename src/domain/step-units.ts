import { open } from 'node:fs/promises';

/**
 * STEP declares its length unit inside a geometric representation context, as
 * either an SI unit (`SI_UNIT(.MILLI.,.METRE.)`) or a conversion-based unit
 * (`CONVERSION_BASED_UNIT('INCH',#12)`). Models are read in that unit so every
 * measurement comes back in the same unit the CAD system exported.
 */
export interface StepLengthUnit {
  /** Short unit name used in responses: mm, cm, m, in, ft, mil, um, km. */
  name: string;
  /** Millimetres per one unit. */
  mmPerUnit: number;
}

export const MILLIMETRE: StepLengthUnit = { name: 'mm', mmPerUnit: 1 };

const SI_PREFIX: Record<string, StepLengthUnit> = {
  '': { name: 'm', mmPerUnit: 1000 },
  $: { name: 'm', mmPerUnit: 1000 },
  '.KILO.': { name: 'km', mmPerUnit: 1_000_000 },
  '.DECI.': { name: 'dm', mmPerUnit: 100 },
  '.CENTI.': { name: 'cm', mmPerUnit: 10 },
  '.MILLI.': { name: 'mm', mmPerUnit: 1 },
  '.MICRO.': { name: 'um', mmPerUnit: 0.001 },
  '.NANO.': { name: 'nm', mmPerUnit: 1e-6 },
};

const NAME_BY_KEYWORD: Array<[RegExp, string]> = [
  [/INCH|"IN"/i, 'in'],
  [/FOOT|FEET|"FT"/i, 'ft'],
  [/MIL|THOU/i, 'mil'],
  [/MICROMETRE|MICROMETER|MICRON/i, 'um'],
  [/MILLIMETRE|MILLIMETER/i, 'mm'],
  [/CENTIMETRE|CENTIMETER/i, 'cm'],
  [/KILOMETRE|KILOMETER/i, 'km'],
  [/METRE|METER/i, 'm'],
];

const SI_UNIT = /SI_UNIT\s*\(\s*([^,()]*?)\s*,\s*\.METRE\.\s*\)/;
const CONVERSION_BASED_UNIT = /CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'\s*,\s*#(\d+)/;
const MEASURE_WITH_UNIT = (id: string) =>
  new RegExp(
    `#${id}\\s*=\\s*MEASURE_WITH_UNIT\\s*\\(\\s*LENGTH_MEASURE\\s*\\(\\s*([0-9eE.+-]+)\\s*\\)\\s*,\\s*#(\\d+)`,
  );
const SI_UNIT_FOR_ID = (id: string) =>
  new RegExp(`#${id}\\s*=\\s*\\(?[^;]*?SI_UNIT\\s*\\(\\s*([^,()]*?)\\s*,\\s*\\.METRE\\.\\s*\\)`);

function nameFor(keyword: string, fallback: string): string {
  for (const [pattern, name] of NAME_BY_KEYWORD) if (pattern.test(keyword)) return name;
  return fallback;
}

/** Parse the declared length unit from STEP text. Falls back to millimetres. */
export function detectStepLengthUnit(text: string): StepLengthUnit {
  const conversion = CONVERSION_BASED_UNIT.exec(text);
  if (conversion) {
    const [, keyword, measureId] = conversion;
    const measure = MEASURE_WITH_UNIT(measureId!).exec(text);
    if (measure) {
      const value = Number(measure[1]);
      const base = SI_UNIT_FOR_ID(measure[2]!).exec(text);
      const baseUnit = base ? SI_PREFIX[base[1]!.trim()] : undefined;
      if (Number.isFinite(value) && value > 0) {
        return { name: nameFor(keyword!, 'unit'), mmPerUnit: value * (baseUnit?.mmPerUnit ?? 1) };
      }
    }
  }
  const si = SI_UNIT.exec(text);
  if (si) {
    const unit = SI_PREFIX[si[1]!.trim()];
    if (unit) return unit;
  }
  return MILLIMETRE;
}

/**
 * Read the unit from a STEP file. Unit declarations sit in the header region,
 * so a bounded prefix read is enough; larger files are read up to the cap.
 */
export async function readStepLengthUnit(
  filePath: string,
  maxBytes = 8 * 1024 * 1024,
): Promise<StepLengthUnit> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return detectStepLengthUnit(buffer.subarray(0, bytesRead).toString('latin1'));
  } finally {
    await handle.close();
  }
}
