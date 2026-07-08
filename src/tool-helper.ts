import type { AnalysisError, AnalysisErrorType } from './utils/errors.js';

function normalizeError(error: unknown): AnalysisError {
  if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
    const raw = error as { type?: unknown; message?: unknown };
    const type: AnalysisErrorType =
      raw.type === 'file_not_found' || raw.type === 'invalid_format' || raw.type === 'invalid_input'
        ? raw.type
        : 'unknown';
    return { type, message: String(raw.message ?? '') };
  }
  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function runTool<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  } catch (error) {
    const { type, message } = normalizeError(error);
    return {
      content: [{ type: 'text' as const, text: `${type}: ${message}` }],
      isError: true,
    };
  }
}
