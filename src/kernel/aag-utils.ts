import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';

/**
 * Compute the dihedral angle (in degrees) between two faces along a shared edge.
 * Returns the signed angle where positive indicates the faces open toward each
 * other (convex crease) and negative indicates they fold inward (concave crease).
 * LLM should interpret the magnitude and sign for engineering meaning.
 */
export function computeDihedralAngle(
  kernel: OcctKernel,
  faceA: ShapeHandle,
  faceB: ShapeHandle,
  sharedEdge: ShapeHandle,
): number {
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
    if (taLen < 1e-12) return 0;

    const tHat = { x: ta.x / taLen, y: ta.y / taLen, z: ta.z / taLen };
    const cA = normalize(cross(nA, tHat));
    const cB = normalize(cross(nB, tHat));

    const dot = dotProduct(cA, cB);
    const clamped = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clamped);
    return angleRad * (180 / Math.PI);
  } catch {
    return 0;
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
