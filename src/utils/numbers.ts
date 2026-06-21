interface NumericStats {
  count: number;
  total: number;
  average: number;
  min: number;
  max: number;
}

export function emptyStats(): NumericStats {
  return { count: 0, total: 0, average: 0, min: 0, max: 0 };
}

export function bucketLength(length: number): 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' {
  if (length < 1) return 'tiny';
  if (length < 5) return 'small';
  if (length < 20) return 'medium';
  if (length < 100) return 'large';
  return 'xlarge';
}
