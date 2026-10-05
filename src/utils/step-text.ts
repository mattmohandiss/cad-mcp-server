import { readFile } from 'node:fs/promises';
import type { AnalysisError } from './errors.js';

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
