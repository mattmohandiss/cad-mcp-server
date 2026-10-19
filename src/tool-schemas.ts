import { z } from 'zod';
import { parseEntityId } from './utils/ids.js';

export const SURFACE_TYPES = [
  'plane',
  'cylinder',
  'cone',
  'sphere',
  'torus',
  'bspline',
  'other',
] as const;

export const CURVE_TYPES = ['line', 'circle', 'ellipse', 'bspline', 'other'] as const;

/**
 * Drop null-valued keys before validation. Tool-calling models routinely emit
 * `null` for fields they are not using, which a strict schema would reject.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, stripNulls(entry)]),
    );
  }
  return value;
}

const SCHEMA_ID_FORMS =
  '"face:N", "edge:N", "vertex:N", "body:N", or "component:<name>#<instance>/face:N"';

const bodyIdRefine = (id: string) => {
  const [type, index, extra] = id.split(':');
  if (extra !== undefined || type !== 'body' || !index) return false;
  const n = Number(index);
  return Number.isInteger(n) && n >= 0 && String(n) === index;
};

const entityIdRefine = (id: string) => parseEntityId(id) !== null;

/** True when `id` names an entity of `kind`, in either the whole-part or the scoped form. */
const isKind = (id: string, kind: string) => parseEntityId(id)?.type === kind;

export const entityId = z
  .string()
  .refine(entityIdRefine, `Entity IDs must match ${SCHEMA_ID_FORMS}.`)
  .meta({
    description: `Entity ID. Whole part: "face:N", "edge:N", "vertex:N", or "body:N". Assembly occurrence: "component:<name>#<instance>/face:N".`,
  });

export const bodyId = z
  .string()
  .refine(bodyIdRefine, 'Body IDs must match body:N.')
  .meta({ description: 'Body ID: "body:N".' });

export const shapeEntityId = entityId.refine(
  (id) => isKind(id, 'face') || isKind(id, 'edge') || isKind(id, 'body'),
  'Must be a face:N, edge:N, or body:N ID — or a component-scoped component:<name>/face:N or component:<name>/edge:N ID — from a prior find or inspect result.',
);

export const point3 = z.array(z.number()).length(3);

export const directionModeSchema = z.enum(['axis', 'normal']).meta({
  description:
    'Direction shortcut. axis = along the entity axis; normal = along the entity normal.',
});
