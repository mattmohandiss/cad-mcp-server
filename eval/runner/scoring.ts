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
    const diff = Math.abs(extracted - expected);
    if (tolerance === 0) {
      // Always apply relative tolerance for float precision, even with tolerance:0.
      // 6.000000000000001 vs 6 = match within 0.01%
      return diff / Math.max(Math.abs(extracted), Math.abs(expected), 1e-9) < 0.01;
    }
    return (
      diff <= tolerance || diff / Math.max(Math.abs(extracted), Math.abs(expected), 1e-9) < 0.01
    );
  }

  if (isPlainObject(expected) && isPlainObject(extracted)) {
    const expectedKeys = Object.keys(expected);
    return expectedKeys.every(
      (key) => key in extracted && compareAnswer(extracted[key], expected[key], tolerance),
    );
  }

  return extracted === expected;
}

export interface FieldComparison {
  path: string;
  expected: unknown;
  extracted: unknown;
  match: boolean;
}

export function compareFields(
  extracted: unknown,
  expected: unknown,
  tolerance: number,
  path = '',
): FieldComparison[] {
  if (isPlainObject(expected)) {
    return Object.entries(expected).flatMap(([key, value]) =>
      compareFields(
        isPlainObject(extracted) ? extracted[key] : undefined,
        value,
        tolerance,
        path ? `${path}.${key}` : key,
      ),
    );
  }

  return [{ path, expected, extracted, match: compareAnswer(extracted, expected, tolerance) }];
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
  if (isPlainObject(value)) {
    return z.object(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaForValue(item)])),
    );
  }
  return z.unknown();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareJsonValues(a: unknown, b: unknown): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
