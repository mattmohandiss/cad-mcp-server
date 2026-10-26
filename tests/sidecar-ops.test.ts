import { describe, expect, it } from 'vitest';
import { assertOperations } from '../src/sidecar/runtime.js';
import { SIDECAR_OPS } from '../src/sidecar/operations.js';

/**
 * This check exists because of a real failure: the packaged sidecar predated the
 * `pmi` operation, so `describe_pmi` returned `internal_error: Unknown operation:
 * pmi` mid-conversation, as an MCP tool error with empty content. Two evaluation
 * runs called it and nothing in the message text showed the mistake.
 */
describe('sidecar operation surface', () => {
  it('accepts a binary that implements every required operation', () => {
    expect(() => assertOperations([...SIDECAR_OPS], '/fake/sidecar')).not.toThrow();
  });

  it('accepts operations it does not use', () => {
    expect(() => assertOperations([...SIDECAR_OPS, 'somethingNew'], '/fake')).not.toThrow();
  });

  it('names the missing operation, which is the whole point', () => {
    const stale = SIDECAR_OPS.filter((op) => op !== 'pmi');
    expect(() => assertOperations([...stale], '/fake/sidecar.exe')).toThrowError(
      /does not implement pmi/,
    );
  });

  it('says the source is newer than the binary and how to fix it', () => {
    const stale = SIDECAR_OPS.filter((op) => op !== 'pmi');
    expect(() => assertOperations([...stale], '/fake')).toThrowError(
      /out of date|newer than the binary/,
    );
    expect(() => assertOperations([...stale], '/fake')).toThrowError(/Rebuild the sidecar payload/);
  });

  it('treats a binary that reports nothing as missing everything', () => {
    // One failure mode, not two: an old payload is a payload that implements none
    // of what we call, and it should say so by name.
    expect(() => assertOperations(undefined, '/fake')).toThrowError(/does not implement hello/);
    expect(() => assertOperations([], '/fake')).toThrowError(/does not implement/);
  });

  it('lists every operation the package calls', () => {
    expect([...SIDECAR_OPS]).toEqual([
      'hello',
      'open',
      'close',
      'inspect',
      'pmi',
      'findEntities',
      'measureEntityDistances',
      'measureGeometry',
      'meshChunk',
    ]);
  });
});
