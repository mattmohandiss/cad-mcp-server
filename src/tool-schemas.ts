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

export const aggregateSpec = z
  .string()
  .regex(
    /^(count|min|max|avg|stddev|sum)(:[a-z_][a-z0-9_]*)?$/,
    'Format: <op>[:<field>]. Examples: "count", "min:area".',
  )
  .meta({
    description: 'Stats: count, min:field, max:field, avg:field, stddev:field, sum:field.',
  });
