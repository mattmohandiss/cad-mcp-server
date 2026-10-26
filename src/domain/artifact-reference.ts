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

export const artifactLocatorSchema = z
  .object({
    uri: artifactUriSchema.meta({
      description: 'STEP file to read, as a file: URI or an absolute filesystem path.',
    }),
  })
  .strict();
export const artifactReferenceSchema = z
  .object({
    revision: artifactRevisionSchema,
    uri: artifactUriSchema,
    format: z.literal('step'),
    units: z.string(),
  })
  .strict();
// Inputs only need the binding fields; defaults fill the rest so a caller can
// pass back the reference without reproducing every literal.
export const artifactReferenceInputSchema = z.object({
  revision: artifactRevisionSchema.meta({
    description:
      'sha256 revision returned by inspect. Rejected if the file changed since then, which is what keeps IDs and measurements bound to one revision.',
  }),
  uri: artifactUriSchema.meta({
    description: 'Same STEP file the revision came from, as a file: URI or absolute path.',
  }),
  format: z.literal('step').optional().meta({ description: "Always 'step'." }),
  units: z
    .string()
    .optional()
    .meta({ description: 'Spatial unit of the source file; echoed from inspect.' }),
});
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

/**
 * Geometry is read and measured in the file's declared unit, so an inch part
 * stays in inches and an engineer's numbers need no conversion. Consumers that
 * need another unit ask their own tool for it; no conversion factor is exposed
 * as an invitation for the caller to do arithmetic.
 */
export function stepModelFrame(units: string) {
  return {
    id: 'step-model',
    origin: [0, 0, 0],
    axes: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    handedness: 'right',
    units,
  } as const;
}

export function artifactPath(uri: string): string {
  return fileURLToPath(toArtifactUri(uri));
}

export function artifactReference(filePath: string, revision: string, units: string) {
  return {
    revision,
    uri: pathToFileURL(filePath).href,
    format: 'step' as const,
    units,
  };
}

/** The unit block every geometry result carries. */
export function measurementUnits(source: { name: string }) {
  return {
    length: source.name,
    area: `${source.name}2`,
    volume: `${source.name}3`,
  };
}

/** State the unit without asking the caller to do arithmetic. */
export function unitNote(source: { name: string }): string {
  return `Lengths are in ${source.name}.`;
}

export function subjectReference(id: string) {
  const kind = parseEntityId(id)?.type ?? 'entity';
  return {
    type: 'geometry' as const,
    entity: { ...ENTITY_ID_SCHEME, id, kind },
  };
}
