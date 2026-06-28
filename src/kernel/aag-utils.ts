import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';

export type EdgeVexity = 'convex' | 'concave' | 'smooth';

/**
 * Compute the dihedral angle and edge convexity between two faces along a
 * shared edge. The convexity classification is deterministic — it derives
 * from the sign of the cross-product dot product (floating-point epsilon
 * only guards against exact tangency noise).
 *
 *   dot > 0.05  → convex   (faces open away from each other)
 *   dot < -0.05 → concave  (faces fold toward each other)
 *   else        → smooth   (tangent/near-tangent)
 */
export function computeEdgeConvexity(
  kernel: OcctKernel,
  faceA: ShapeHandle,
  faceB: ShapeHandle,
  sharedEdge: ShapeHandle,
): { dihedral_angle_deg: number; convexity: EdgeVexity } {
  try {
    const params = kernel.curveParameters(sharedEdge);
    const midParam = (params.first + params.last) / 2;

    const tangent = kernel.curveTangent(sharedEdge, midParam);
    const point = kernel.curvePointAtParam(sharedEdge, midParam);

    const uvA = kernel.uvFromPoint(faceA, point);
    const uvB = kernel.uvFromPoint(faceB, point);

    const normalA = kernel.surfaceNormal(faceA, uvA.u, uvA.v);
    const normalB = kernel.surfaceNormal(faceB, uvB.u, uvB.v);

    const ta: Vec3 = { x: tangent.x, y: tangent.y, z: tangent.z };
    const nA: Vec3 = { x: normalA.x, y: normalA.y, z: normalA.z };
    const nB: Vec3 = { x: normalB.x, y: normalB.y, z: normalB.z };

    const taLen = magnitude(ta);
    if (taLen < 1e-12) return { dihedral_angle_deg: 0, convexity: 'smooth' };

    const tHat = { x: ta.x / taLen, y: ta.y / taLen, z: ta.z / taLen };
    const cA = normalize(cross(nA, tHat));
    const cB = normalize(cross(nB, tHat));

    const dot = dotProduct(cA, cB);
    const clamped = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clamped);
    const dihedral_angle_deg = angleRad * (180 / Math.PI);

    let convexity: EdgeVexity;
    if (dot > 0.05) convexity = 'convex';
    else if (dot < -0.05) convexity = 'concave';
    else convexity = 'smooth';

    return { dihedral_angle_deg, convexity };
  } catch {
    return { dihedral_angle_deg: 0, convexity: 'smooth' };
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dotProduct(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = magnitude(v);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
