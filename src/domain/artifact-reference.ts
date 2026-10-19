import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { parseEntityId } from '../utils/ids.js';

export const artifactRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * Accept what a person or an LLM host would naturally provide: an absolute or
 * relative filesystem path, or a file: URI. Relative paths resolve against the
 * server's working directory. Everything else is rejected before any kernel
 * work starts.
 */
export function toArtifactUri(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Provide a local STEP file path or a file: URI.');

  if (/^file:/i.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error(`Invalid file: URI: ${input}`);
    }
    if (url.protocol !== 'file:' || !url.pathname)
      throw new Error('Provide a local STEP file path or a file: URI.');
    return url.href;
  }

  // Any other absolute URI (http:, s3:, ...) is out of scope; a Windows drive
  // letter does not match because it has no scheme separator.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input))
    throw new Error(
      'Geometry MCP reads local files only; provide a filesystem path or a file: URI.',
    );

  return pathToFileURL(resolve(input)).href;
}

export const artifactUriSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      toArtifactUri(value);
      return true;
    } catch {
      return false;
    }
  }, 'Provide a local STEP file path or a file: URI.');

export const artifactLocatorSchema = z.object({ uri: artifactUriSchema }).strict();
export const artifactReferenceSchema = z
  .object({
    revision: artifactRevisionSchema,
    uri: artifactUriSchema,
    format: z.literal('step'),
    units: z.literal('mm'),
  })
  .strict();
// Inputs only need the binding fields; defaults fill the rest so a caller can
// pass back the reference without reproducing every literal.
export const artifactReferenceInputSchema = z
  .object({
    revision: artifactRevisionSchema,
    uri: artifactUriSchema,
    format: z.literal('step').default('step'),
    units: z.literal('mm').default('mm'),
  })
  .strict();
// The response's top-level artifact already identifies the revision, so a
// subject carries only the entity it points at.
export const subjectReferenceSchema = z
  .object({
    type: z.literal('geometry'),
    entity: z
      .object({
        authority: z.string().min(1),
        idScheme: z.string().min(1),
        id: z.string().min(1),
        kind: z.string().min(1),
      })
      .strict(),
    locator: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ENTITY_ID_SCHEME = {
  authority: 'cad-mcp-server',
  idScheme: 'occt-topology-v1',
} as const;

export const STEP_MODEL_FRAME = {
  id: 'step-model',
  origin: [0, 0, 0],
  axes: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  handedness: 'right',
  units: 'mm',
} as const;

export function artifactPath(uri: string): string {
  return fileURLToPath(toArtifactUri(uri));
}

export function artifactReference(filePath: string, revision: string) {
  return {
    revision,
    uri: pathToFileURL(filePath).href,
    format: 'step' as const,
    units: 'mm' as const,
  };
}

export function subjectReference(id: string) {
  const kind = parseEntityId(id)?.type ?? 'entity';
  return {
    type: 'geometry' as const,
    entity: { ...ENTITY_ID_SCHEME, id, kind },
  };
}
