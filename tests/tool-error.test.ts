import { describe, expect, it } from 'vitest';
import { runTool } from '../src/tool-helper.js';
import { handler as handleInspectStep } from '../src/tools/inspect.js';

describe('tool error handling', () => {
  it('returns isError for missing STEP files', async () => {
    const result = await runTool('inspect', () =>
      handleInspectStep({ uri: 'file:///tmp/does_not_exist.step' }),
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('file_not_found');
  });
});
