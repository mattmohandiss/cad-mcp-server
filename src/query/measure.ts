/**
 * Measure op dispatch.
 *
 * Maps each `measure` op on a query_step input to a kernel call and returns
 * the structured per-entity result. The result is a `MeasureResults` object
 * keyed by the op name (e.g. `{ray_test: [...], distance: 0.42}`).
 *
 * Implemented ops:
 *   - ray_test                single ray, returns hits
 *   - ray_test_segment         bounded ray (origin + direction + tmax)
 *   - ray_test_grid            grid of rays across a face/edge
 *   - distance                 min distance to a target entity
 *   - distance_extrema         closest point pairs between two shapes
 *   - draft_angle              face draft relative to pull direction
 *   - classify_point           IN/ON/OUT of a face (UV-based)
 *   - closest_point_on_face    project 3D point to face, return UV
 *   - contains_point           3D point-in-solid test
 *   - surface_curvature        min/max/gaussian/mean at a point on a face
 *   - edge_projection          closest point on edge + tangent + parameter
 *   - section_by_plane         planar cross-section, returns edge curves
 *   - continuity               edge smoothness between adjacent faces
 *
 * Staged (not yet implemented):
 *   - curvature_at_param
 *   - principal_directions
 */

import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';
import { resolveRayHits, queryRay } from '../kernel/ray-utils.js';
import { parseEntityId } from '../utils/ids.js';
import { toBoundingBox } from '../kernel/measure.js';

type MeasureOpName =
  | 'ray_test'
  | 'ray_test_segment'
  | 'ray_test_grid'
  | 'distance'
  | 'distance_extrema'
  | 'section_by_plane'
  | 'curvature_at_param'
  | 'continuity'
  | 'principal_directions'
  | 'draft_angle'
  | 'closest_point_on_face'
  | 'classify_point'
  | 'contains_point'
  | 'surface_curvature'
  | 'edge_projection';

export interface MeasureSpec {
  op: MeasureOpName;
  direction?: number[];
  direction_shortcut?: string;
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
  detail_level?: 'aggregate' | 'summary' | 'points';
}

export type MeasureResults = Record<string, unknown>;

/**
 * Dispatch all measure ops against a single entity's shape handle.
 * Each op's result is added to the returned object under its op name.
 */
export function dispatchMeasure(
  kernel: OcctKernel,
  shape: ShapeHandle,
  entityHandle: ShapeHandle,
  specs: MeasureSpec[],
  options: MeasureContext = {},
): MeasureResults {
  const out: MeasureResults = {};
  for (const spec of specs) {
    const result = runMeasure(kernel, shape, entityHandle, spec, options);
    if (result !== undefined) {
      out[spec.op] = result;
    }
  }
  return out;
}

/**
 * Per-iteration context for the pipeline. Lets `for_each` pass the current
 * item's geometry into the measure dispatch (e.g. resolve "extent_max"
 * against the current group's bbox).
 */
interface MeasureContext {
  /* Optional: if the parent iteration has a current item with an extent,
   * these are used to resolve symbolic origins like "extent_max" / "extent_min". */
  current_extent_min?: [number, number, number];
  current_extent_max?: [number, number, number];
  current_axis?: { direction: [number, number, number]; location: [number, number, number] };
}

function runMeasure(
  kernel: OcctKernel,
  shape: ShapeHandle,
  entityHandle: ShapeHandle,
  spec: MeasureSpec,
  context: MeasureContext,
): unknown {
  switch (spec.op) {
    case 'ray_test': {
      const origin = resolveOrigin(spec.origin, context);
      const direction = normalizeDirection(spec.direction ?? [0, 0, 1]);
      const hits = queryRay(kernel, shape, origin, direction);
      return hits;
    }
    case 'ray_test_segment': {
      const origin = resolveOrigin(spec.origin, context);
      const direction = normalizeDirection(spec.direction ?? [0, 0, 1]);
      const tmax = spec.tmax ?? Number.POSITIVE_INFINITY;
      const raw = kernel.rayIntersect(shape, origin, direction);
      /* Filter hits to tmax (the kernel doesn't take a bounded tmax). */
      const filtered = filterByDistance(raw, tmax);
      const hits = resolveRayHits(kernel, shape, filtered);
      return hits;
    }
    case 'ray_test_grid': {
      /* Grid of rays fired FROM the entity's surface INTO the parent
       * model. The grid is laid out across the entity's bbox; each ray
       * is tested against the parent model. This is the canonical
       * pattern for wall-thickness estimation: sample across the face,
       * see if rays exit the model. */
      const direction = normalizeDirection(spec.direction ?? [0, 0, 1]);
      const spacing = spec.spacing_mm ?? 2.0;
      return runRayTestGrid(kernel, shape, entityHandle, direction, spacing);
    }
    case 'distance': {
      if (!spec.to) {
        return { error: 'missing "to" entity ID' };
      }
      const targetShape = resolveTargetShape(kernel, shape, spec.to);
      if (!targetShape) {
        return { error: `target "${spec.to}" not found` };
      }
      const dist = kernel.distanceBetween(entityHandle, targetShape);
      return dist;
    }
    case 'draft_angle': {
      const direction = normalizeDirection(spec.direction ?? [0, 0, 1]);
      // Sample the face normal at the center UV (0.5, 0.5)
      const normal = kernel.surfaceNormal(entityHandle, 0.5, 0.5);
      if (!normal) return { error: 'could not compute face normal' };
      const dot = normal.x * direction.x + normal.y * direction.y + normal.z * direction.z;
      const clamped = Math.max(-1, Math.min(1, dot));
      const angle = Math.acos(clamped) * (180 / Math.PI);
      // Draft angle = 90° - angle between normal and pull direction
      // Positive = face tapers inward (good for ejection)
      // Negative = face overhangs (undercut — needs side action)
      const draft = 90 - angle;
      return {
        draft_angle_deg: Math.round(draft * 100) / 100,
        normal: [normal.x, normal.y, normal.z] as [number, number, number],
        undercut: draft < 0,
      };
    }
    case 'classify_point': {
      if (!spec.point) {
        return { error: 'missing "point" coordinate' };
      }
      /* 2D point-in-face via the existing classifyPointOnFace kernel call.
       * The face's UV bounds are queried first; the point's UV is then
       * classified. For 3D point-in-solid, use the containsPoint kernel
       * call for 3D point-in-solid checks. */
      const uv = tryProjectToFaceUV(kernel, entityHandle, spec.point);
      if (!uv) {
        return { error: 'point does not project to face' };
      }
      const state = kernel.classifyPointOnFace(entityHandle, uv[0], uv[1]);
      /* state is "in" | "on" | "out" (TopAbs state). Return as-is. */
      return state;
    }
    case 'closest_point_on_face': {
      if (!spec.point) {
        return { error: 'missing "point" coordinate' };
      }
      const uv = tryProjectToFaceUV(kernel, entityHandle, spec.point);
      if (!uv) {
        return { error: 'point does not project to face' };
      }
      /* Use the surface adaptor to evaluate the face at the UV. */
      const pointOnSurface = kernel.pointOnSurface(entityHandle, uv[0], uv[1]);
      return { uv, point_on_surface: pointOnSurface };
    }
    case 'contains_point': {
      if (!spec.point) {
        return { error: 'missing "point" coordinate' };
      }
      const tol = spec.tolerance ?? 1e-7;
      const inside = kernel.containsPoint(
        shape,
        { x: spec.point[0], y: spec.point[1], z: spec.point[2] },
        tol,
      );
      return inside;
    }
    case 'surface_curvature': {
      if (!spec.point) {
        return { error: 'missing "point" coordinate' };
      }
      const uv = tryProjectToFaceUV(kernel, entityHandle, spec.point);
      if (!uv) {
        return { error: 'point does not project to face' };
      }
      const curvature = kernel.surfaceCurvature(entityHandle, uv[0], uv[1]);
      return {
        min_curvature: curvature.min,
        max_curvature: curvature.max,
        gaussian_curvature: curvature.gaussian,
        mean_curvature: curvature.mean,
      };
    }
    case 'edge_projection': {
      if (!spec.point) {
        return { error: 'missing "point" coordinate' };
      }
      try {
        const projection = kernel.projectPointOnEdge(entityHandle, {
          x: spec.point[0],
          y: spec.point[1],
          z: spec.point[2],
        });
        return {
          closest_point: [projection.point.x, projection.point.y, projection.point.z],
          tangent: [projection.tangent.x, projection.tangent.y, projection.tangent.z],
          parameter: projection.parameter,
        };
      } catch {
        return { error: 'edge projection failed' };
      }
    }
    case 'distance_extrema': {
      if (!spec.to) {
        return { error: 'missing "to" entity ID' };
      }
      const targetShape = resolveTargetShape(kernel, shape, spec.to);
      if (!targetShape) {
        return { error: `target "${spec.to}" not found` };
      }
      const pairs = kernel.distanceExtrema(entityHandle, targetShape);
      const mapped = pairs.map((p) => {
        const dx = p.pointB.x - p.pointA.x;
        const dy = p.pointB.y - p.pointA.y;
        const dz = p.pointB.z - p.pointA.z;
        return {
          distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
          point_on_entity: [p.pointA.x, p.pointA.y, p.pointA.z] as [number, number, number],
          point_on_target: [p.pointB.x, p.pointB.y, p.pointB.z] as [number, number, number],
        };
      });
      const distances = mapped.map((p) => p.distance);
      return {
        pairs: mapped,
        pair_count: pairs.length,
        min_distance: distances.length > 0 ? Math.min(...distances) : undefined,
        max_distance: distances.length > 0 ? Math.max(...distances) : undefined,
      };
    }
    case 'section_by_plane': {
      if (!spec.plane_origin || !spec.plane_normal) {
        return { error: 'missing "plane_origin" and "plane_normal"' };
      }
      const origin = {
        x: spec.plane_origin[0],
        y: spec.plane_origin[1],
        z: spec.plane_origin[2],
      };
      const normal = normalizeDirection(spec.plane_normal);
      const sectionShape = kernel.sectionByPlane(entityHandle, origin, normal);
      /* Extract edges from the section result. */
      const sectionEdges = kernel.getSubShapes(sectionShape, 'edge');
      const edgeData = sectionEdges.map((e) => {
        try {
          const bbox = toBoundingBox(kernel, e);
          return {
            curve_type: kernel.curveType(e),
            length: kernel.getLength(e),
            bbox,
          };
        } catch {
          return { curve_type: 'unknown', length: 0, bbox: null };
        }
      });
      return { edge_count: sectionEdges.length, edges: edgeData };
    }
    case 'continuity': {
      /* Resolve the two faces sharing this edge via BRepGraph. */
      const edgeIdx = findEdgeIndex(kernel, shape, entityHandle);
      if (edgeIdx < 0) {
        return { error: 'could not resolve edge index' };
      }
      kernel.graphBuild(shape);
      try {
        const faceIndices = kernel.graphEdgeFaces(edgeIdx);
        if (faceIndices.length < 2) {
          return { error: 'edge is not shared by two faces' };
        }
        const allFaces = kernel.getSubShapes(shape, 'face');
        const faceA = allFaces[faceIndices[0]];
        const faceB = allFaces[faceIndices[1]];
        const cont = kernel.edgeContinuity(entityHandle, faceA, faceB);
        return { continuity: cont };
      } catch {
        return { error: 'continuity check failed' };
      }
    }
    case 'curvature_at_param':
    case 'principal_directions':
      return {
        staged: true,
        op: spec.op,
        message: `${spec.op} is not implemented.`,
      };
    default:
      return { error: `unknown measure op "${spec.op}"` };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveOrigin(origin: number[] | string | undefined, context: MeasureContext): Vec3 {
  if (Array.isArray(origin)) {
    return { x: origin[0], y: origin[1], z: origin[2] };
  }
  if (typeof origin === 'string') {
    if (origin === 'extent_max' && context.current_extent_max) {
      const e = context.current_extent_max;
      return { x: e[0], y: e[1], z: e[2] };
    }
    if (origin === 'extent_min' && context.current_extent_min) {
      const e = context.current_extent_min;
      return { x: e[0], y: e[1], z: e[2] };
    }
    /* Symbolic origin without context: fall back to model origin. */
    return { x: 0, y: 0, z: 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

function normalizeDirection(dir: number[]): Vec3 {
  const [x, y, z] = dir;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: x / len, y: y / len, z: z / len };
}

function filterByDistance(raw: number[], tmax: number): number[] {
  /* raw is a flat array with stride 7: [faceHash, dist, x, y, z, u, v]. */
  const out: number[] = [];
  for (let i = 0; i + 7 <= raw.length; i += 7) {
    if (raw[i + 1] <= tmax) {
      for (let j = 0; j < 7; j++) out.push(raw[i + j]);
    }
  }
  return out;
}

function runRayTestGrid(
  kernel: OcctKernel,
  shape: ShapeHandle,
  entityHandle: ShapeHandle,
  direction: Vec3,
  spacing: number,
): {
  hits: Array<{ face_id: string; distance: number; point: [number, number, number] }>;
  total_rays: number;
  hit_distance: number[];
} {
  /* The grid is laid out across the entity's bbox; each ray is fired
   * against the parent model. This is the canonical pattern for wall
   * thickness: start from the face surface, look for the model to
   * occlude the ray. */
  const bbox = kernel.getBoundingBox(entityHandle, false);
  const hits: Array<{ face_id: string; distance: number; point: [number, number, number] }> = [];
  const MAX_RAYS = 10000;
  let totalRays = 0;

  /* Find the entity's face index so we can filter out self-hits. */
  const faceShapes = kernel.getSubShapes(shape, 'face');
  let entityFaceIdx = -1;
  for (let i = 0; i < faceShapes.length; i++) {
    if (kernel.isSame(faceShapes[i], entityHandle)) {
      entityFaceIdx = i;
      break;
    }
  }

  /* Pick two perpendicular axes in the plane orthogonal to direction. */
  const absDir = [Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z)];
  let uAxis: Vec3 =
    absDir[0] < absDir[1] && absDir[0] < absDir[2] ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const udot = uAxis.x * direction.x + uAxis.y * direction.y + uAxis.z * direction.z;
  uAxis = {
    x: uAxis.x - udot * direction.x,
    y: uAxis.y - udot * direction.y,
    z: uAxis.z - udot * direction.z,
  };
  const uLen = Math.sqrt(uAxis.x * uAxis.x + uAxis.y * uAxis.y + uAxis.z * uAxis.z);
  if (uLen > 1e-9) {
    uAxis = { x: uAxis.x / uLen, y: uAxis.y / uLen, z: uAxis.z / uLen };
  }
  const vAxis: Vec3 = {
    x: direction.y * uAxis.z - direction.z * uAxis.y,
    y: direction.z * uAxis.x - direction.x * uAxis.z,
    z: direction.x * uAxis.y - direction.y * uAxis.x,
  };

  const corners = [
    { x: bbox.xmin, y: bbox.ymin, z: bbox.zmin },
    { x: bbox.xmax, y: bbox.ymin, z: bbox.zmin },
    { x: bbox.xmin, y: bbox.ymax, z: bbox.zmin },
    { x: bbox.xmin, y: bbox.ymin, z: bbox.zmax },
    { x: bbox.xmax, y: bbox.ymax, z: bbox.zmin },
    { x: bbox.xmax, y: bbox.ymin, z: bbox.zmax },
    { x: bbox.xmin, y: bbox.ymax, z: bbox.zmax },
    { x: bbox.xmax, y: bbox.ymax, z: bbox.zmax },
  ];
  let uMin = Infinity,
    uMax = -Infinity,
    vMin = Infinity,
    vMax = -Infinity;
  for (const c of corners) {
    const ud = c.x * uAxis.x + c.y * uAxis.y + c.z * uAxis.z;
    const vd = c.x * vAxis.x + c.y * vAxis.y + c.z * vAxis.z;
    if (ud < uMin) uMin = ud;
    if (ud > uMax) uMax = ud;
    if (vd < vMin) vMin = vd;
    if (vd > vMax) vMax = vd;
  }

  const cols = Math.max(1, Math.ceil((uMax - uMin) / spacing));
  const rows = Math.max(1, Math.ceil((vMax - vMin) / spacing));

  for (let r = 0; r < rows && totalRays < MAX_RAYS; r++) {
    for (let c = 0; c < cols && totalRays < MAX_RAYS; c++) {
      const uu = uMin + (c + 0.5) * spacing;
      const vv = vMin + (r + 0.5) * spacing;
      const gridOrigin: Vec3 = {
        x: uAxis.x * uu + vAxis.x * vv,
        y: uAxis.y * uu + vAxis.y * vv,
        z: uAxis.z * uu + vAxis.z * vv,
      };
      /* Project the grid origin onto the entity surface so rays start
       * from the actual face, not the bbox projection plane. */
      let origin = gridOrigin;
      try {
        const projected = kernel.projectPointOnFace(entityHandle, gridOrigin);
        if (projected) {
          origin = projected;
        }
      } catch {
        /* Keep gridOrigin if projection fails (non-planar face edge case). */
      }
      /* Fire against the parent shape, not the entity itself.
       * Skip self-hits (ray starting on the same face it hit). */
      const rayHits = queryRay(kernel, shape, origin, direction);
      for (const h of rayHits) {
        if (entityFaceIdx >= 0 && h.face_id === `face:${entityFaceIdx}`) continue;
        hits.push(h);
      }
      totalRays++;
    }
  }

  return {
    hits,
    total_rays: totalRays,
    hit_distance: hits.map((h) => h.distance),
  };
}

function resolveTargetShape(
  kernel: OcctKernel,
  shape: ShapeHandle,
  entityId: string,
): ShapeHandle | undefined {
  const parsed = parseEntityId(entityId);
  if (!parsed) return undefined;
  try {
    const kernelType = parsed.type === 'body' ? 'solid' : parsed.type;
    const subs = kernel.getSubShapes(shape, kernelType);
    return subs[parsed.index];
  } catch {
    return undefined;
  }
}

function tryProjectToFaceUV(
  kernel: OcctKernel,
  face: ShapeHandle,
  point: number[],
): [number, number] | undefined {
  try {
    const projected = kernel.projectPointOnFace(face, { x: point[0], y: point[1], z: point[2] });
    /* projectPointOnFace returns the closest point; uvFromPoint then
     * maps that 3D point back to a UV coordinate on the face. */
    const uv = kernel.uvFromPoint(face, projected);
    return [uv.u, uv.v];
  } catch {
    return undefined;
  }
}

function findEdgeIndex(kernel: OcctKernel, shape: ShapeHandle, edge: ShapeHandle): number {
  const edges = kernel.getSubShapes(shape, 'edge');
  for (let i = 0; i < edges.length; i++) {
    if (kernel.isSame(edges[i], edge)) return i;
  }
  return -1;
}
