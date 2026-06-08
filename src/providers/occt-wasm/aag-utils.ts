import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';

export interface AagFaceNode {
  index: number;
  surfaceType: string;
  area: number;
  hasInnerWires: boolean;
  centerOfMass: Vec3;
}

export interface AagAdjacency {
  faceAIndex: number;
  faceBIndex: number;
  vexity: 'convex' | 'concave' | 'smooth' | 'unknown';
  dihedralAngleDeg: number;
  sharedEdgeCount: number;
  sharedCurveTypes: string[];
}

export interface AagRawGraph {
  faces: AagFaceNode[];
  adjacencies: AagAdjacency[];
}

export function buildAagFromShape(kernel: OcctKernel, shape: ShapeHandle): AagRawGraph {
  const faceShapes = kernel.getSubShapes(shape, 'face');
  const rawFaces: Array<{
    shape: ShapeHandle;
    surfaceType: string;
    area: number;
    hasInnerWires: boolean;
    centerOfMass: Vec3;
  }> = [];

  for (const face of faceShapes) {
    const outerWire = kernel.outerWire(face);
    const innerWireCount = faceWiresCount(kernel, face, outerWire);
    rawFaces.push({
      shape: face,
      surfaceType: kernel.surfaceType(face),
      area: kernel.getSurfaceArea(face),
      hasInnerWires: innerWireCount > 1,
      centerOfMass: kernel.getSurfaceCenterOfMass(face),
    });
  }

  const faces: AagFaceNode[] = rawFaces.map((f, i) => ({
    index: i,
    surfaceType: f.surfaceType,
    area: f.area,
    hasInnerWires: f.hasInnerWires,
    centerOfMass: f.centerOfMass,
  }));

  const adjacencies: AagAdjacency[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawFaces.length; i++) {
    const faceA = rawFaces[i].shape;
    const adjacent = kernel.adjacentFaces(shape, faceA);

    for (const faceB of adjacent) {
      const j = rawFaces.findIndex((f) => kernel.isSame(f.shape, faceB));
      if (j === -1 || j <= i) continue;

      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sharedEdges = kernel.sharedEdges(faceA, faceB);
      if (sharedEdges.length === 0) continue;

      const curveTypes = new Set<string>();
      for (const edge of sharedEdges) {
        curveTypes.add(kernel.curveType(edge));
      }

      const primaryEdge = sharedEdges[0];
      const vexityResult = computeEdgeVexity(kernel, faceA, faceB, primaryEdge);

      adjacencies.push({
        faceAIndex: i,
        faceBIndex: j,
        vexity: vexityResult.vexity,
        dihedralAngleDeg: vexityResult.dihedralAngleDeg,
        sharedEdgeCount: sharedEdges.length,
        sharedCurveTypes: [...curveTypes],
      });
    }
  }

  return { faces, adjacencies };
}

function faceWiresCount(kernel: OcctKernel, face: ShapeHandle, outerWire: ShapeHandle): number {
  try {
    const wires = kernel.getSubShapes(face, 'wire');
    return wires.length;
  } catch {
    return outerWire ? 1 : 0;
  }
}

export function computeEdgeVexity(
  kernel: OcctKernel,
  faceA: ShapeHandle,
  faceB: ShapeHandle,
  sharedEdge: ShapeHandle
): { vexity: AagAdjacency['vexity']; dihedralAngleDeg: number } {
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
    if (taLen < 1e-12) {
      return { vexity: 'unknown', dihedralAngleDeg: 0 };
    }
    const tHat = { x: ta.x / taLen, y: ta.y / taLen, z: ta.z / taLen };

    const cA = normalize(cross(nA, tHat));
    const cB = normalize(cross(nB, tHat));

    const dot = dotProduct(cA, cB);
    const clamped = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clamped);
    const dihedralAngleDeg = angleRad * (180 / Math.PI);

    if (dot > 0.05) return { vexity: 'convex', dihedralAngleDeg };
    if (dot < -0.05) return { vexity: 'concave', dihedralAngleDeg };
    return { vexity: 'smooth', dihedralAngleDeg };
  } catch {
    return { vexity: 'unknown', dihedralAngleDeg: 0 };
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
