export function makeId(prefix: string, index: number | string): string {
  return `${prefix}:${index}`;
}

export function makeFeatureId(type: string, index: number): string {
  return `feature:${type}:${index}`;
}

export function makeWarningId(type: string, index = 0): string {
  return `warning:${type}:${index}`;
}
