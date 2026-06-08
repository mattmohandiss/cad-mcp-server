import { readFile } from 'node:fs/promises';
import { OcctError, OcctErrorCode, type OcctKernel, type ShapeHandle } from 'occt-wasm';
import { type AnalysisError, unknownError } from '../../utils/errors.js';
import { getOcctKernel } from './kernel.js';

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

export async function withImportedStep<T>(
  filePath: string,
  action: string,
  analyze: (kernel: OcctKernel, shape: ShapeHandle, stepText: string) => T
): Promise<T> {
  let kernel: OcctKernel | undefined;
  let shape: ShapeHandle | undefined;

  try {
    const stepText = await readStepText(filePath);
    kernel = await getOcctKernel();
    shape = kernel.importStep(stepText);
    return analyze(kernel, shape, stepText);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
      throw error;
    }
    throw mapOcctError(error, action);
  } finally {
    if (kernel && shape !== undefined) {
      kernel.release(shape);
    }
  }
}
