export interface NumericStats {
  count: number;
  total: number;
  average: number;
  min: number;
  max: number;
}

export function emptyStats(): NumericStats {
  return { count: 0, total: 0, average: 0, min: 0, max: 0 };
}

export function summarizeNumbers(values: number[]): NumericStats {
  if (values.length === 0) return emptyStats();

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    count: values.length,
    total,
    average: total / values.length,
    min,
    max,
  };
}

export function bucketLength(length: number): 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' {
  if (length < 1) return 'tiny';
  if (length < 5) return 'small';
  if (length < 20) return 'medium';
  if (length < 100) return 'large';
  return 'xlarge';
}
