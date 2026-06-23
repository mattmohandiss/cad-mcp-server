export type AnalysisErrorType = 'file_not_found' | 'invalid_format' | 'invalid_input' | 'unknown';

export interface AnalysisError {
  type: AnalysisErrorType;
  message: string;
}

export function unknownError(error: unknown, action: string): AnalysisError {
  return {
    type: 'unknown',
    message: `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}
