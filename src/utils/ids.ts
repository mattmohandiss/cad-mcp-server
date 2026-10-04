/**
 * Geometry entity IDs.
 *
 * Two forms share one grammar so the engineer's two views of the model stay
 * unambiguous:
 *
 * - `face:N`, `edge:N`, `vertex:N`, `body:N` — an entity of the *whole part*
 *   (the root shape), or of a flat single-part file.
 * - `component:<name>/face:N` — an entity scoped to a named component.
 * - `component:<name>#<instance>/face:N` — an entity scoped to one repeated
 *   component occurrence.
 *
 * `component_name` selection resolves to component-scoped IDs; whole-part and
 * body queries use unscoped IDs.
 */

export type EntityKind = 'face' | 'edge' | 'vertex' | 'body';

const ENTITY_KINDS: readonly EntityKind[] = ['face', 'edge', 'vertex', 'body'];

export interface ParsedEntityId {
  /** Assembly component the entity belongs to, or undefined for the whole part. */
  component?: string;
  /**
   * Instance index of the component within the assembly, when the id names one.
   * A component that appears several times (multi-instance assembly) has one
   * node per instance; the instance index disambiguates them. Omitted for
   * whole-part ids and for single-instance components.
   */
  instance?: number;
  type: EntityKind;
  index: number;
}

/** Build an unscoped entity ID, e.g. `face:3` / `body:0`. */
export function makeId(type: EntityKind, index: number | string): string {
  return `${type}:${index}`;
}

/**
 * Build a component-scoped entity ID, e.g. `component:wheel-axle/face:3`.
 * Pass `instance` for a component that appears several times in the assembly,
 * e.g. `component:wheel-axle#1/face:3`.
 */
export function makeScopedId(
  component: string,
  type: EntityKind,
  index: number | string,
  instance?: number,
): string {
  const scope = instance === undefined ? component : `${component}#${instance}`;
  return `component:${scope}/${type}:${index}`;
}

/**
 * Parse either ID form. Returns null when the string is not a valid entity ID.
 * `component:wheel-axle/face:3` → `{ component: 'wheel-axle', type: 'face', index: 3 }`.
 * `component:wheel-axle#1/face:3` → `{ component: 'wheel-axle', instance: 1, type: 'face', index: 3 }`.
 */
export function parseEntityId(id: string | undefined): ParsedEntityId | null {
  if (!id) return null;

  let component: string | undefined;
  let instance: number | undefined;
  let rest = id;

  if (id.startsWith('component:')) {
    const slash = id.indexOf('/');
    if (slash < 0) return null;
    let scope = id.slice('component:'.length, slash);
    if (scope.length === 0) return null;
    const hash = scope.indexOf('#');
    if (hash >= 0) {
      const instanceText = scope.slice(hash + 1);
      scope = scope.slice(0, hash);
      if (scope.length === 0) return null;
      const parsedInstance = Number(instanceText);
      if (
        !Number.isInteger(parsedInstance) ||
        parsedInstance < 0 ||
        String(parsedInstance) !== instanceText
      ) {
        return null;
      }
      instance = parsedInstance;
    }
    component = scope;
    rest = id.slice(slash + 1);
  }

  const parts = rest.split(':');
  if (parts.length !== 2) return null;
  const [type, indexText] = parts;
  if (!ENTITY_KINDS.includes(type as EntityKind)) return null;
  const index = Number(indexText);
  if (!Number.isInteger(index) || index < 0 || String(index) !== indexText) return null;

  if (component === undefined) return { type: type as EntityKind, index };
  return instance === undefined
    ? { component, type: type as EntityKind, index }
    : { component, instance, type: type as EntityKind, index };
}
