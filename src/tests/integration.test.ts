import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleInspectStepFile } from '../tools/step-tools.js';
import { handleDiffStep } from '../tools/diff.js';
import { queryStepFaces } from '../query/faces.js';
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

describe('CAD MCP integration smoke tests', () => {
  it('returns file_not_found for missing STEP files', async () => {
    const missing = expectFailure(await handleInspectStepFile('/tmp/does_not_exist.step'));
    expect(missing.error.type).toBe('file_not_found');
  });

  it.runIf(isWasmAvailable())('returns invalid_format for non-STEP files', async () => {
    const invalid = expectFailure(
      await handleInspectStepFile(path.join(process.cwd(), 'samples', 'dummy.step')),
    );
    expect(invalid.error.type).toBe('invalid_format');
  });

  it.runIf(isWasmAvailable())('returns empty results for out-of-range entity IDs', async () => {
    const data = await queryStepFaces(NIST_FILE, {
      entity_ids: ['face:999'],
    });
    expect(data.entities).toHaveLength(0);
    expect(data.pagination.total_matched).toBe(0);
  });

  it.runIf(isWasmAvailable())(
    'inspects a STEP file and returns size, structure, and metadata',
    async () => {
      const result = expectSuccess(await handleInspectStepFile(NIST_FILE));
      expect(result.data.schema_version).toBe('0.4');
      const size = result.data.size as Record<string, unknown>;
      expect(size.dimensions).toBeDefined();
      expect((size.dimensions as Record<string, number>).width).toBeGreaterThan(0);
      expect((result.data.structure as Record<string, unknown>).body_count).toBeGreaterThan(0);
    },
  );

  it.runIf(isWasmAvailable())(
    'compares a STEP file with itself — all deltas are zero',
    async () => {
      const result = expectSuccess(
        await handleDiffStep({
          baseline_file_path: NIST_FILE,
          comparison_file_path: NIST_FILE,
        }),
      );
      expect(result.data.schema_version).toBe('0.4');
      const deltas = result.data.deltas as Record<string, unknown>;
      expect(deltas.volume).toBe(0);
    },
  );
});
