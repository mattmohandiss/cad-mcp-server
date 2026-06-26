import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';

const RAY_STRIDE = 7;

/**
 * Map raw ray intersection results (flat vector from kernel.rayIntersect)
 * to face IDs using the kernel's shape hash function.
 */
export function resolveRayHits(
  kernel: OcctKernel,
  shape: ShapeHandle,
  raw: number[],
): Array<{ face_id: string; distance: number; point: [number, number, number] }> {
  const faces = kernel.getSubShapes(shape, 'face');
  const HASH_UPPER = 1 << 30;
  const hashToIdx = new Map<number, number>();
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (!f) continue;
    hashToIdx.set(kernel.hashCode(f, HASH_UPPER), i);
  }
  const hits: Array<{ face_id: string; distance: number; point: [number, number, number] }> = [];
  for (let i = 0; i + RAY_STRIDE <= raw.length; i += RAY_STRIDE) {
    const faceHash = raw[i];
    const faceIdx = hashToIdx.get(faceHash);
    if (faceIdx === undefined) continue;
    hits.push({
      face_id: `face:${faceIdx}`,
      distance: raw[i + 1],
      point: [raw[i + 2], raw[i + 3], raw[i + 4]],
    });
  }
  return hits;
}

/**
 * Fire a ray and return annotated hits. Convenience wrapper for MCP tools.
 */
export function queryRay(
  kernel: OcctKernel,
  shape: ShapeHandle,
  origin: Vec3,
  direction: Vec3,
): Array<{ face_id: string; distance: number; point: [number, number, number] }> {
  return resolveRayHits(kernel, shape, kernel.rayIntersect(shape, origin, direction));
}
