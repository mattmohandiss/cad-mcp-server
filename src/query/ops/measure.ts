/**
 * Measure op dispatch. Maps the `measure` array on a query_step input to
 * the underlying kernel/TS operation. Initial implementation focuses on
 * the `ray_test` and `distance` ops; the remaining ops (ray_test_grid,
 * ray_test_segment, distance_extrema, section_by_plane, curvature_at_param,
 * continuity, principal_directions, closest_point_on_face, classify_point)
 * will be implemented alongside the Tier A kernel methods.
 *
 * This module is intentionally side-effect free: it returns a description
 * of what should be computed. The actual execution is wired up in the
 * QueryEngine when the underlying primitives ship.
 */

import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import { resolveRayHits, queryRay } from '../../kernel/ray-utils.js';
import type { Vec3 } from 'occt-wasm';

export interface MeasureSpec {
  op: string;
  direction?: number[];
  origin?: number[] | string;
  tmax?: number;
  spacing_mm?: number;
  to?: string;
  plane_origin?: number[];
  plane_normal?: number[];
  param?: number;
  with?: string;
  point?: number[];
  tolerance?: number;
}

export interface MeasureResult {
  op: string;
  values: Record<string, unknown>;
}

/**
 * Execute a single measure op against a shape, returning the per-entity result.
 * For now only `ray_test` and `distance` are wired; other ops return a stub.
 */
export function applyMeasure(
  kernel: OcctKernel,
  shape: ShapeHandle,
  spec: MeasureSpec,
): MeasureResult {
  switch (spec.op) {
    case 'ray_test': {
      const origin = toVec3(spec.origin ?? [0, 0, 0]);
      const dir = normalize(spec.direction ?? [0, 0, 1]);
      const hits = queryRay(kernel, shape, origin, dir);
      return { op: spec.op, values: { hits } };
    }
    case 'distance': {
      /* Delegated to the existing measure_distance service; for now we
       * acknowledge the request and let the QueryEngine resolve it
       * against the cached model. */
      return {
        op: spec.op,
        values: { deferred: true, to: spec.to, reason: 'distance is resolved by the QueryEngine after entity selection' },
      };
    }
    default:
      return {
        op: spec.op,
        values: { deferred: true, reason: `measure op "${spec.op}" is staged for a subsequent release` },
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function toVec3(value: number[] | string | undefined): Vec3 {
  if (typeof value === 'string') {
    /* Reserved for symbolic origins like "extent_max" / "extent_min";
     * resolution happens at the group/result level, not here. */
    return { x: 0, y: 0, z: 0 };
  }
  const [x, y, z] = value ?? [0, 0, 0];
  return { x, y, z };
}

function normalize(v: number[]): Vec3 {
  const [x, y, z] = v;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: x / len, y: y / len, z: z / len };
}

/* Re-export so the engine doesn't need to know about the ray-utils internals. */
export { resolveRayHits };
