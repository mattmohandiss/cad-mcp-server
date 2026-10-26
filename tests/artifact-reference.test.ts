import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  artifactPath,
  artifactReference,
  artifactUriSchema,
  measurementUnits,
  stepModelFrame,
  toArtifactUri,
  unitNote,
} from '../src/domain/artifact-reference.js';

describe('artifact input normalization', () => {
  it('accepts an absolute filesystem path', () => {
    const path = resolve('tests/fixtures/repeated-instances.step');
    expect(toArtifactUri(path)).toBe(pathToFileURL(path).href);
    expect(artifactPath(path)).toBe(path);
  });

  it('resolves a relative path against the working directory', () => {
    const uri = toArtifactUri('tests/fixtures/repeated-instances.step');
    expect(uri).toBe(pathToFileURL(resolve('tests/fixtures/repeated-instances.step')).href);
    expect(artifactPath(uri)).toBe(resolve('tests/fixtures/repeated-instances.step'));
  });

  it('round-trips a file: URI, including spaces', () => {
    const path = resolve('tests/fixtures/with space.step');
    const uri = toArtifactUri(path);
    expect(uri).toContain('%20');
    expect(artifactPath(uri)).toBe(path);
  });

  it('rejects remote and unsupported schemes', () => {
    expect(() => toArtifactUri('https://example.com/part.step')).toThrow(/local files only/);
    expect(() => toArtifactUri('s3://bucket/part.step')).toThrow(/local files only/);
    expect(() => toArtifactUri('')).toThrow(/local STEP file path/);
  });

  it('labels every measurement in the declared source unit', () => {
    const path = resolve('tests/fixtures/repeated-instances-inch.step');
    expect(artifactReference(path, `sha256:${'0'.repeat(64)}`, 'in').units).toBe('in');
    expect(stepModelFrame('in').units).toBe('in');
  });

  it('reports the declared unit without exposing arithmetic', () => {
    expect(measurementUnits({ name: 'in' })).toEqual({
      length: 'in',
      area: 'in2',
      volume: 'in3',
    });
    expect(unitNote({ name: 'in' })).toBe('Lengths are in in.');
  });

  it('keeps the advertised schema a plain string that validates either form', () => {
    const path = resolve('tests/fixtures/repeated-instances.step');
    expect(artifactUriSchema.parse(path)).toBe(path);
    expect(artifactUriSchema.parse(pathToFileURL(path).href)).toBe(pathToFileURL(path).href);
    expect(artifactUriSchema.safeParse('https://example.com/part.step').success).toBe(false);
  });
});
