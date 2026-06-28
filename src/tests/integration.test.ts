import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  handleCompareStepFiles,
  handleGetStepEntities,
  handleInspectStepFile,
  handleQueryStepPmi,
} from '../tools/step-tools.js';
import { NIST_FILE } from './fixtures.js';
import { isWasmAvailable } from './wasm-guard.js';

interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
}

interface ToolFailure {
  ok: false;
  error: { type: string; message: string };
}

function expectSuccess(value: unknown): ToolSuccess {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const response = value as ToolSuccess | ToolFailure;
  expect(response.ok).toBe(true);
  return response as ToolSuccess;
}

function expectFailure(value: unknown): ToolFailure {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const response = value as ToolSuccess | ToolFailure;
  expect(response.ok).toBe(false);
  return response as ToolFailure;
}

describe.runIf(isWasmAvailable())('CAD MCP integration smoke tests', { timeout: 15_000 }, () => {
  it('returns structured tool errors for missing and invalid STEP files', async () => {
    const missing = expectFailure(await handleInspectStepFile('/nonexistent/file.step'));
    expect(missing.error.type).toBe('file_not_found');

    const dummyPath = path.join(process.cwd(), 'samples', 'dummy.step');
    const invalid = expectFailure(await handleInspectStepFile(dummyPath));
    expect(invalid.error.type).toBe('invalid_format');
  });

  it('returns clean errors for out-of-range entity IDs', async () => {
    const result = expectFailure(
      await handleGetStepEntities(NIST_FILE, {
        entity_type: 'face',
        entity_ids: ['face:999'],
        fields: ['id', 'area'],
      }),
    );
    expect(result.error.type).toBe('invalid_input');
    expect(result.error.message).toContain('out of range');
  });

  it('inspects a STEP file and returns size, structure, and metadata', async () => {
    const result = expectSuccess(await handleInspectStepFile(NIST_FILE));
    expect(result.data.schema_version).toBe('0.4');
    const size = result.data.size as Record<string, unknown>;
    expect(size.dimensions).toBeDefined();
    expect((size.dimensions as Record<string, number>).width).toBeGreaterThan(0);
    expect((result.data.structure as Record<string, unknown>).body_count).toBeGreaterThan(0);
  });

  it('compares a STEP file with itself — all deltas are zero', async () => {
    const result = expectSuccess(await handleCompareStepFiles(NIST_FILE, NIST_FILE));
    expect(result.data.schema_version).toBe('0.4');
    const deltas = result.data.deltas as Record<string, unknown>;
    expect(deltas.volume).toBe(0);
    expect(deltas.inferenceCount).toBeUndefined();
  });

  it('compares two different STEP files and reports non-zero deltas', async () => {
    const ap242File = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );
    const result = expectSuccess(await handleCompareStepFiles(NIST_FILE, ap242File));
    const deltas = result.data.deltas as Record<string, unknown>;
    const dimensions = deltas.dimensions as Record<string, number>;
    const anyNonZero =
      dimensions.width !== 0 ||
      dimensions.height !== 0 ||
      dimensions.depth !== 0 ||
      deltas.volume !== 0 ||
      deltas.surfaceArea !== 0;
    expect(anyNonZero).toBe(true);
  });

  it('PMI statistics reflect filtered counts, not totals', async () => {
    const pmiFile = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );
    const all = expectSuccess(await handleQueryStepPmi(pmiFile, { return_type: 'summary' }));
    const tolerances = expectSuccess(
      await handleQueryStepPmi(pmiFile, {
        pmi_types: ['geometric_tolerance'],
        return_type: 'summary',
      }),
    );
    const allStats = all.data.statistics as Record<string, number>;
    const tolStats = tolerances.data.statistics as Record<string, number>;
    expect(tolStats.matched_pmi).toBeLessThan(allStats.total_pmi);
    expect(tolStats.geometric_tolerance).toBe(tolStats.matched_pmi);
    expect(tolStats.dimension ?? 0).toBe(0);
  });

  it('queries PMI from an AP242 STEP file', async () => {
    const pmiFile = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );
    const summary = expectSuccess(await handleQueryStepPmi(pmiFile, { return_type: 'summary' }));
    expect(summary.data.schema_version).toBe('0.4');
    expect((summary.data.statistics as Record<string, unknown>).total_pmi).toBeGreaterThan(0);

    const entities = expectSuccess(
      await handleQueryStepPmi(pmiFile, {
        pmi_types: ['geometric_tolerance'],
        limit: 5,
      }),
    );
    const items = entities.data.entities as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].type).toBe('geometric_tolerance');
  });
});
