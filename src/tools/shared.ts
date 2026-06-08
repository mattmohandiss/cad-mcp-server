import type { AnalysisError } from '../utils/errors.js';

export type ToolResponse<T> = { ok: true; data: T } | { ok: false; error: AnalysisError };

export async function wrapTool<T>(run: () => Promise<T>): Promise<ToolResponse<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function normalizeError(error: unknown): AnalysisError {
  if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
    const candidate = error as AnalysisError;
    return { type: candidate.type, message: candidate.message };
  }

  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function isToolError(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'ok' in result &&
    (result as { ok?: unknown }).ok === false
  );
}
