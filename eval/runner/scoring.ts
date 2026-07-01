import { z } from 'zod';

export function buildAnswerSchema(
  field: string,
  value: unknown,
): z.ZodObject<Record<string, z.ZodType>> {
  return z.object({ [field]: schemaForValue(value).describe(`Answer field: ${field}`) });
}

export function compareAnswer(extracted: unknown, expected: unknown, tolerance: number): boolean {
  if (extracted === null || extracted === undefined) return false;

  if (Array.isArray(expected) && Array.isArray(extracted)) {
    const expectedSorted = [...expected].sort(compareJsonValues);
    const extractedSorted = [...extracted].sort(compareJsonValues);
    return (
      expectedSorted.length === extractedSorted.length &&
      expectedSorted.every((value, index) =>
        compareAnswer(extractedSorted[index], value, tolerance),
      )
    );
  }

  if (typeof expected === 'number' && typeof extracted === 'number') {
    if (tolerance === 0) return extracted === expected;
    const diff = Math.abs(extracted - expected);
    return (
      diff <= tolerance || diff / Math.max(Math.abs(extracted), Math.abs(expected), 1e-9) < 0.01
    );
  }

  return extracted === expected;
}

export function computeScore(
  extracted: unknown,
  expected: unknown,
  tolerance: number,
  matched: boolean,
): number {
  if (!matched) return 0;
  if (typeof expected === 'number' && typeof extracted === 'number' && tolerance > 0) {
    const diff = Math.abs(extracted - expected);
    return Math.max(60, Math.round(100 - (diff / tolerance) * 40));
  }
  return 100;
}

function schemaForValue(value: unknown): z.ZodType {
  if (typeof value === 'number') return z.number();
  if (typeof value === 'boolean') return z.boolean();
  if (typeof value === 'string') return z.string();
  if (Array.isArray(value)) {
    if (value.length === 0) return z.array(z.unknown());
    // Infer concrete item type from the first element so structured output
    // can generate a valid JSON Schema (OpenAI requires items.type).
    const item = value[0];
    if (typeof item === 'number') return z.array(z.number());
    if (typeof item === 'string') return z.array(z.string());
    if (typeof item === 'boolean') return z.array(z.boolean());
    return z.array(z.unknown());
  }
  return z.unknown();
}

function compareJsonValues(a: unknown, b: unknown): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
