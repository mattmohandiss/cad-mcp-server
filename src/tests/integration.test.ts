import { describe, expect, it } from 'vitest';
import { handleInspectStepFile } from '../tools/step-tools.js';

interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
}

interface ToolFailure {
  ok: false;
  error: { type: string; message: string };
}

function expectFailure(value: unknown): ToolFailure {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const response = value as ToolSuccess | ToolFailure;
  expect(response.ok).toBe(false);
  return response as ToolFailure;
}

describe('error handling', () => {
  it('returns file_not_found for missing STEP files', async () => {
    const missing = expectFailure(await handleInspectStepFile('/tmp/does_not_exist.step'));
    expect(missing.error.type).toBe('file_not_found');
  });
});
