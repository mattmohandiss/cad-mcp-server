import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { parseEntityId } from '../utils/ids.js';

export const artifactRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const artifactUriSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === 'file:';
    } catch {
      return false;
    }
  }, 'Geometry MCP currently supports local file: artifact URIs only.');

export const artifactLocatorSchema = z.object({ uri: artifactUriSchema }).strict();
export const artifactReferenceSchema = z
  .object({
    revision: artifactRevisionSchema,
    uri: artifactUriSchema,
    format: z.literal('step'),
    units: z.literal('mm'),
  })
  .strict();
export const subjectReferenceSchema = z
  .object({
    type: z.literal('geometry'),
    artifact: artifactReferenceSchema,
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
  return fileURLToPath(uri);
}

export function artifactReference(filePath: string, revision: string) {
  return {
    revision,
    uri: pathToFileURL(filePath).href,
    format: 'step' as const,
    units: 'mm' as const,
  };
}

export function subjectReference(artifact: ReturnType<typeof artifactReference>, id: string) {
  const kind = parseEntityId(id)?.type ?? 'entity';
  return {
    type: 'geometry' as const,
    artifact,
    entity: { ...ENTITY_ID_SCHEME, id, kind },
  };
}
