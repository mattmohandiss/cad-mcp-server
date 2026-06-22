import { readFile } from 'node:fs/promises';
import { OcctError, OcctErrorCode } from 'occt-wasm';
import { type AnalysisError, unknownError } from '../utils/errors.js';

export function mapOcctError(error: unknown, action: string): AnalysisError {
  if (error instanceof OcctError) {
    return {
      type: error.code === OcctErrorCode.ImportExportFailed ? 'invalid_format' : 'unknown',
      message: `${action} failed: ${error.message}`,
    };
  }

  return unknownError(error, action);
}

export async function readStepText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw {
      type: 'file_not_found',
      message: `File not found: ${filePath}. ${message}`,
    } satisfies AnalysisError;
  }
}
