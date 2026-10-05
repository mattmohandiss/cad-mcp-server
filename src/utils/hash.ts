import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Content-hash revision of a STEP file. The cad-viewer resolves geometry
 * identity via a revision plus a typed subject reference, so a bare
 * "face:12" is only meaningful with its model revision. Additive: callers
 * keep returning bare entity IDs alongside this envelope.
 */
export function fileRevision(filePath: string): string {
  try {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) return 'unknown';
    const data = readFileSync(resolved);
    return 'sha256:' + createHash('sha256').update(data).digest('hex');
  } catch {
    return 'unknown';
  }
}

export function modelReference(filePath: string, units?: string) {
  return {
    source: resolve(filePath),
    revision: fileRevision(filePath),
    units,
  };
}

export function subjectReference(filePath: string, entityId: string, units?: string) {
  const kind = entityId.split(':')[0] || 'entity';
  return {
    type: 'geometry',
    model: modelReference(filePath, units),
    entityId,
    kind,
    locator: { entityId, kind },
  };
}
