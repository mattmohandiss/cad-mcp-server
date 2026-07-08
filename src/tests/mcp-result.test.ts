import { describe, expect, it } from 'vitest';
import { runTool } from '../tool-helper.js';

describe('MCP tool result shape', () => {
  it('returns structuredContent and text for success', async () => {
    const result = await runTool(async () => ({ value: 42 }));

    expect(result.structuredContent).toEqual({ value: 42 });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ value: 42 }, null, 2) },
    ]);
    expect(result.isError).toBeUndefined();
  });

  it('marks errors with isError and formatted text', async () => {
    const result = await runTool(async () => {
      throw { type: 'file_not_found', message: 'File not found: model.step' };
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: 'file_not_found: File not found: model.step' },
    ]);
    expect(result.isError).toBe(true);
  });

  it('handles unknown errors gracefully', async () => {
    const result = await runTool(async () => {
      throw new Error('unexpected');
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'unknown: unexpected' }]);
  });
});
