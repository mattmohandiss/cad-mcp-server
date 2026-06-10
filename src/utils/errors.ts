export type AnalysisErrorType =
  | 'file_not_found'
  | 'invalid_format'
  | 'parse_error'
  | 'not_implemented'
  | 'unknown';

export interface AnalysisError {
  type: AnalysisErrorType;
  message: string;
}

export type AnalysisResult<T> = T | AnalysisError;

export function isAnalysisError<T>(result: AnalysisResult<T>): result is AnalysisError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    'message' in result &&
    typeof (result as AnalysisError).message === 'string'
  );
}

export function unknownError(error: unknown, action: string): AnalysisError {
  return {
    type: 'unknown',
    message: `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}
