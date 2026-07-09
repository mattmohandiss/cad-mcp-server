import { z } from 'zod';

const bodyIdRefine = (id: string) => {
  const [type, index, extra] = id.split(':');
  if (extra !== undefined || type !== 'body' || !index) return false;
  const n = Number(index);
  return Number.isInteger(n) && n >= 0 && String(n) === index;
};

const entityIdRefine = (id: string) => {
  const parts = id.split(':');
  if (parts.length !== 2) return false;
  const [type, index] = parts;
  if (!['face', 'edge', 'vertex', 'body'].includes(type)) return false;
  const n = Number(index);
  return Number.isInteger(n) && n >= 0 && String(n) === index;
};

export const filePath = z.string().min(1).meta({
  description: 'Path to STEP file on local filesystem.',
});

export const entityId = z
  .string()
  .refine(entityIdRefine, 'Entity IDs must match face:N, edge:N, vertex:N, or body:N.')
  .meta({ description: 'Entity ID: "face:N", "edge:N", "vertex:N", or "body:N".' });

export const bodyId = z
  .string()
  .refine(bodyIdRefine, 'Body IDs must match body:N.')
  .meta({ description: 'Body ID: "body:N".' });

export const faceEntityId = entityId.refine(
  (id) => id.startsWith('face:'),
  'Must be a face:N ID from a prior find_faces or inspect_step result.',
);

export const shapeEntityId = entityId.refine(
  (id) => id.startsWith('face:') || id.startsWith('edge:') || id.startsWith('body:'),
  'Must be a face:N, edge:N, or body:N ID from a prior find or inspect result.',
);

export const aggregateSpec = z
  .string()
  .regex(
    /^(count|min|max|avg|stddev|sum)(:[a-z_][a-z0-9_]*)?$/,
    'Format: <op>[:<field>]. Examples: "count", "min:area".',
  )
  .meta({
    description: 'Stats: count, min:field, max:field, avg:field, stddev:field, sum:field.',
  });

export const point3 = z.array(z.number()).length(3);

export const directionModeSchema = z.enum(['axis', 'normal']).meta({
  description:
    'Direction shortcut. axis = along the entity axis; normal = along the entity normal.',
});

export const includePresetsSchema = z.enum([
  'basic',
  'bounds',
  'geometry',
  'adjacency',
  'topology',
  'quality',
]);

export const summarizeUniqueSchema = z.enum(['radius', 'diameter']);

export function entityIdArray(schema: z.ZodType<string>, description: string) {
  return z.array(schema).min(1).max(500).meta({ description });
}

export function exclusiveFields(
  fieldA: string,
  fieldB: string,
): (value: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    if (value[fieldA] !== undefined && value[fieldB] !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [fieldB],
        message: `${fieldA} and ${fieldB} are mutually exclusive`,
      });
    }
  };
}
