import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BoundingBox, Point3D } from '../types/schema.js';
import { makeId } from '../utils/ids.js';
import { toBoundingBox } from './measure.js';
import { computeEdgeConvexity } from './aag-utils.js';

function bboxToTuple(bbox: BoundingBox): {
  min: [number, number, number];
  max: [number, number, number];
} {
  return {
    min: [bbox.min.x, bbox.min.y, bbox.min.z],
    max: [bbox.max.x, bbox.max.y, bbox.max.z],
  };
}

function pointToTuple(p: Point3D): [number, number, number] {
  return [p.x, p.y, p.z];
}

function bboxCenter(bbox: BoundingBox): [number, number, number] {
  return [
    (bbox.min.x + bbox.max.x) / 2,
    (bbox.min.y + bbox.max.y) / 2,
    (bbox.min.z + bbox.max.z) / 2,
  ];
}

/**
 * Build face/edge → body index via BRepGraph reverse indices (O(1) per entity).
 * Replaces the old hash-based buildBodyMap.
 */
export function buildBodyMap(
  kernel: OcctKernel,
  shape: ShapeHandle,
): { faceBody: number[]; edgeBody: number[] } {
  kernel.graphBuild(shape);
  const bodyMap = kernel.graphBodyMap(); // [faceCount, edgeCount, faceBody..., edgeBody...]
  const fc = bodyMap[0];
  const ec = bodyMap[1];
  const faceBody = Array.from(bodyMap.slice(2, 2 + fc));
  const edgeBody = Array.from(bodyMap.slice(2 + fc, 2 + fc + ec));
  return { faceBody, edgeBody };
}

export interface ExtractedEdgeEntity {
  id: string;
  index: number;
  curve_type: string;
  length: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  bbox_center: [number, number, number];
  start_point?: [number, number, number];
  end_point?: [number, number, number];
  start_vertex?: string;
  end_vertex?: string;
  radius?: number;
  convexity?: string;
  body_id?: string;
  adjacent_faces?: Array<{ face_id: string; surface_type: string }>;
}

export function extractEdgeEntities(
  kernel: OcctKernel,
  shape: ShapeHandle,
  bodyMap?: { faceBody: number[]; edgeBody: number[] },
): ExtractedEdgeEntity[] {
  kernel.graphBuild(shape);
  const edges = kernel.getSubShapes(shape, 'edge');
  const entities: ExtractedEdgeEntity[] = [];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const curveType = kernel.curveType(edge);
    const length = kernel.getLength(edge);
    const brepBbox = toBoundingBox(kernel, edge);
    const bbox = bboxToTuple(brepBbox);
    const center = bboxCenter(brepBbox);

    const entity: ExtractedEdgeEntity = {
      id: makeId('edge', i),
      index: i,
      curve_type: curveType,
      length,
      bbox,
      bbox_center: center,
    };

    if (curveType === 'circle') {
      entity.radius = estimateCircleRadius(kernel, edge, length);
    }

    // Vertex IDs via BRepGraph.
    try {
      const verts = kernel.graphEdgeVertices(i);
      if (verts.length >= 2) {
        entity.start_vertex = makeId('vertex', verts[0]);
        entity.end_vertex = makeId('vertex', verts[1]);
      }
    } catch {
      // Vertex lookup failed, skip.
    }

    // Convexity for edges with exactly two faces.
    try {
      const faceIndices = kernel.graphEdgeFaces(i);
      if (faceIndices.length === 2) {
        const allFaces = kernel.getSubShapes(shape, 'face');
        const fA = allFaces[faceIndices[0]];
        const fB = allFaces[faceIndices[1]];
        if (fA && fB) {
          entity.convexity = computeEdgeConvexity(kernel, fA, fB, edge).convexity;
        }
      }
    } catch {
      // Convexity computation failed, skip.
    }

    // Endpoint coordinates via traditional TopoDS kernel methods.
    try {
      const edgeVertices = kernel.getSubShapes(edge, 'vertex');
      if (edgeVertices.length >= 2) {
        const startP = kernel.vertexPosition(edgeVertices[0]);
        const endP = kernel.vertexPosition(edgeVertices[1]);
        if (startP) entity.start_point = pointToTuple(startP);
        if (endP) entity.end_point = pointToTuple(endP);
      }
    } catch {
      // Endpoint extraction failed, skip.
    }

    entity.body_id =
      bodyMap && bodyMap.edgeBody[i] >= 0 ? makeId('body', bodyMap.edgeBody[i]) : undefined;

    entities.push(entity);
  }

  return entities;
}

function estimateCircleRadius(
  kernel: OcctKernel,
  edge: ShapeHandle,
  length: number,
): number | undefined {
  try {
    const params = kernel.curveParameters(edge);
    const span = Math.abs(params.last - params.first);
    if (span > 1e-9) return length / span;
  } catch {
    // OCCT could not surface curve parameters; radius is unavailable.
  }
  return undefined;
}

export interface ExtractedFaceEntity {
  id: string;
  index: number;
  surface_type: string;
  area: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  bbox_center: [number, number, number];
  normal?: [number, number, number];
  radius?: number;
  axis?: {
    direction: [number, number, number];
    location: [number, number, number];
  };
  body_id?: string;
  outer_edges?: string[];
  inner_wires?: string[][];
  adjacent_faces?: Array<{
    face_id: string;
    surface_type: string;
    dihedral_angle_deg: number;
    shared_edge?: string;
  }>;
  closest_face_distance?: {
    face_id: string;
    distance: number;
  };
}

export function extractFaceEntities(
  kernel: OcctKernel,
  shape: ShapeHandle,
  bodyMap?: { faceBody: number[]; edgeBody: number[] },
): ExtractedFaceEntity[] {
  kernel.graphBuild(shape);
  const faces = kernel.getSubShapes(shape, 'face');
  const entities: ExtractedFaceEntity[] = [];

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const surfaceType = kernel.surfaceType(face);
    const area = kernel.getSurfaceArea(face);
    const brepBbox = toBoundingBox(kernel, face);
    const bbox = bboxToTuple(brepBbox);
    const center = bboxCenter(brepBbox);

    const entity: ExtractedFaceEntity = {
      id: makeId('face', i),
      index: i,
      surface_type: surfaceType,
      area,
      bbox,
      bbox_center: center,
    };

    // Surface normal.
    try {
      const uv = kernel.uvFromPoint(face, { x: center[0], y: center[1], z: center[2] });
      if (uv) {
        const normal = kernel.surfaceNormal(face, uv.u, uv.v);
        if (normal) entity.normal = pointToTuple(normal);
      }
    } catch {
      // Normal extraction failed.
    }

    // Cylinder data.
    if (surfaceType === 'cylinder') {
      try {
        const cylData = kernel.getFaceCylinderData(face);
        if (cylData && cylData.radius !== undefined) entity.radius = cylData.radius;
      } catch {
        // ignore
      }
      try {
        const axisData = kernel.getFaceCylinderAxis(face);
        if (axisData) {
          entity.axis = {
            direction: [axisData.direction.x, axisData.direction.y, axisData.direction.z],
            location: [axisData.location.x, axisData.location.y, axisData.location.z],
          };
        }
      } catch {
        // ignore
      }
    }

    // Wire topology via BRepGraph.
    try {
      const wireData = kernel.graphWireTopology(i);
      let pos = 0;
      const outerCount = wireData[pos++];
      if (outerCount > 0) {
        entity.outer_edges = [];
        for (let o = 0; o < outerCount; o++) entity.outer_edges.push(makeId('edge', wireData[pos++]));
      }
      const innerCount = wireData[pos++];
      if (innerCount > 0) {
        entity.inner_wires = [];
        for (let w = 0; w < innerCount; w++) {
          const ec = wireData[pos++];
          const wireEdges: string[] = [];
          for (let e = 0; e < ec; e++) wireEdges.push(makeId('edge', wireData[pos++]));
          entity.inner_wires.push(wireEdges);
        }
      }
    } catch {
      // Wire topology extraction failed.
    }

    entity.body_id =
      bodyMap && bodyMap.faceBody[i] >= 0 ? makeId('body', bodyMap.faceBody[i]) : undefined;

    entities.push(entity);
  }

  return entities;
}
