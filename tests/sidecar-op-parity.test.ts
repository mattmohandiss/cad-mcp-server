import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SIDECAR_OPS } from '../src/sidecar/operations.js';

/**
 * The sidecar's operation list is written three times — in `dispatch()`, in the
 * frame loop, and in the `hello` reply — and a fourth on the TypeScript side. They
 * have to agree, and this test enforces it by reading the C++ source, because
 * nothing else can: the compiler does not see across the language boundary.
 *
 * It exists because the list was wrong the first time it was written. The `hello`
 * reply advertised `meshChunk` (correct, but served by the frame loop) and omitted
 * four operations that `dispatch()` implements; and it could just as easily have
 * gone the other way, promising an operation that would fail at run time.
 */
const SOURCE = fileURLToPath(new URL('../occt/sidecar/cpp/sidecar.cpp', import.meta.url));

const source = readFileSync(SOURCE, 'utf8');

/** Operations the request dispatcher implements: `op == "name"`. */
const dispatched = new Set([...source.matchAll(/op == "([A-Za-z]+)"/g)].map((match) => match[1]!));

/** Operations served by the frame loop instead: `operation == "name"`. */
const framed = new Set(
  [...source.matchAll(/operation == "([A-Za-z]+)"/g)].map((match) => match[1]!),
);

/** The list the `hello` reply advertises. */
const helloBlock = /"ops", \{([\s\S]*?)\}\},/.exec(source);
const advertised = new Set(
  [...(helloBlock?.[1] ?? '').matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]!),
);

describe('sidecar operation parity', () => {
  it('advertises exactly what the binary implements', () => {
    const implemented = new Set([...dispatched, ...framed]);
    expect([...advertised].sort()).toEqual([...implemented].sort());
  });

  it('implements every operation this package calls', () => {
    const implemented = new Set([...dispatched, ...framed]);
    const unsupported = SIDECAR_OPS.filter((op) => !implemented.has(op));
    expect(unsupported).toEqual([]);
  });

  it('finds the three sources in the C++ so the checks cannot pass vacuously', () => {
    // A regex that silently matched nothing would make the two tests above pass
    // for the wrong reason, which is worse than failing.
    expect(dispatched.size).toBeGreaterThan(10);
    expect([...framed]).toContain('meshChunk');
    expect(advertised.size).toBeGreaterThan(10);
  });
});
