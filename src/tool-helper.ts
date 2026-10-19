import type { CallToolResult } from '@modelcontextprotocol/server';
import { describeError } from './errors.js';
import { logEvent } from './logging.js';

/**
 * Run one tool implementation and shape the result for MCP.
 *
 * Success returns `structuredContent` plus the serialized JSON in a text block
 * (the spec's backwards-compatibility guidance). Failure returns an actionable
 * `code: message` text block with `isError: true` so the model can self-correct;
 * no stack trace or host path is exposed.
 */
export async function runTool<T extends Record<string, unknown>>(
  name: string,
  fn: () => Promise<T>,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  logEvent('tool.started', { tool: name });
  try {
    const data = await fn();
    logEvent('tool.completed', { tool: name, durationMs: Date.now() - startedAt });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  } catch (error) {
    const { code, message } = describeError(error);
    logEvent('tool.failed', { tool: name, durationMs: Date.now() - startedAt, error: message });
    return { content: [{ type: 'text', text: `${code}: ${message}` }], isError: true };
  }
}
