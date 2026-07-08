import { describe, expect, it } from 'vitest';
import { handler as handleInspectStep } from '../tools/inspect.js';

describe('error handling', () => {
  it('returns isError for missing STEP files', async () => {
    const result = await handleInspectStep({ file_path: '/tmp/does_not_exist.step' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('file_not_found');
  });
});
