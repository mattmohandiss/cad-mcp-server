export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}\n... [truncated, total ${value.length} chars]`;
}

export function shortModelName(modelId: string): string {
  return modelId.split('/').pop() ?? modelId;
}
