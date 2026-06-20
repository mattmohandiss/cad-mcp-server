import { describe, expect, it } from 'vitest';
import { jsonToolResult } from '../index.js';

describe('MCP tool result shape', () => {
  it('unwraps successful ToolResponse into structuredContent and text', () => {
    const payload = { ok: true, data: { value: 42 } };
    const result = jsonToolResult(payload);

    expect(result.structuredContent).toEqual({ value: 42 });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ value: 42 }, null, 2) },
    ]);
    expect(result.isError).toBeUndefined();
  });

  it('marks tool errors as MCP execution errors with actionable text', () => {
    const payload = {
      ok: false,
      error: { type: 'file_not_found', message: 'File not found: model.step' },
    };
    const result = jsonToolResult(payload);

    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: 'file_not_found: File not found: model.step' },
    ]);
    expect(result.isError).toBe(true);
  });

  it('passes raw non-ToolResponse payload through unchanged', () => {
    const payload = { some: 'data' };
    const result = jsonToolResult(payload);

    expect(result.structuredContent).toEqual(payload);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(payload, null, 2) }]);
    expect(result.isError).toBeUndefined();
  });
});
