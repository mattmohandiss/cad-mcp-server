import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  artifactPath,
  artifactUriSchema,
  toArtifactUri,
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

  it('keeps the advertised schema a plain string that validates either form', () => {
    const path = resolve('tests/fixtures/repeated-instances.step');
    expect(artifactUriSchema.parse(path)).toBe(path);
    expect(artifactUriSchema.parse(pathToFileURL(path).href)).toBe(pathToFileURL(path).href);
    expect(artifactUriSchema.safeParse('https://example.com/part.step').success).toBe(false);
  });
});
