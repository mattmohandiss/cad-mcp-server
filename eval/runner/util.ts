export function shortModelName(modelId: string): string {
  return modelId.split('/').pop() ?? modelId;
}
