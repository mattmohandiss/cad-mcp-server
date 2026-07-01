export function makeId(prefix: string, index: number | string): string {
  return `${prefix}:${index}`;
}

export interface ParsedEntityId {
  type: 'face' | 'edge' | 'vertex' | 'body';
  index: number;
}

export function parseEntityId(id: string | undefined): ParsedEntityId | null {
  if (!id) return null;

  const parts = id.split(':');
  if (parts.length !== 2) return null;

  const [type, indexText] = parts;
  if (type !== 'face' && type !== 'edge' && type !== 'vertex' && type !== 'body') return null;

  const index = Number(indexText);
  if (!Number.isInteger(index) || index < 0 || String(index) !== indexText) return null;

  return { type, index };
}
