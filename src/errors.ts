import type { AnalysisErrorType } from './utils/errors.js';

const KNOWN_CODES: readonly AnalysisErrorType[] = [
  'file_not_found',
  'invalid_format',
  'invalid_input',
  'stale_reference',
];

/**
 * Normalize a thrown value into a stable code and a model-readable message.
 * Domain errors carry `type`; anything else becomes `internal_error`.
 */
export function describeError(error: unknown): { code: string; message: string } {
  if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
    const raw = error as { type?: unknown; message?: unknown };
    const code =
      typeof raw.type === 'string' && (KNOWN_CODES as readonly string[]).includes(raw.type)
        ? raw.type
        : 'internal_error';
    return { code, message: String(raw.message ?? '') };
  }
  return {
    code: 'internal_error',
    message: error instanceof Error ? error.message : String(error),
  };
}
