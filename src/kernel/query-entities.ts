import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BoundingBox, Point3D } from '../types/schema.js';
import { makeId } from '../utils/ids.js';
import { toBoundingBox } from './measure.js';

/**
 * Convert BoundingBox to tuple format for query response.
 */
function bboxToTuple(bbox: BoundingBox): {
  min: [number, number, number];
  max: [number, number, number];
} {
  return {
    min: [bbox.min.x, bbox.min.y, bbox.min.z],
    max: [bbox.max.x, bbox.max.y, bbox.max.z],
  };
}

/**
 * Convert Point3D to tuple format.
 */
function pointToTuple(p: Point3D): [number, number, number] {
  return [p.x, p.y, p.z];
}

/**
 * Calculate center of a bounding box.
 */
function bboxCenter(bbox: BoundingBox): [number, number, number] {
  return [
    (bbox.min.x + bbox.max.x) / 2,
    (bbox.min.y + bbox.max.y) / 2,
    (bbox.min.z + bbox.max.z) / 2,
  ];
}

/**
 * Build a face-index-to-body-index and edge-index-to-body-index map by
 * iterating sub-shapes of each body (solid). Faces/edges not belonging
 * to any body get index -1 (shells, faces-only models, etc.).
 */
export function buildBodyMap(
  kernel: OcctKernel,
  shape: ShapeHandle,
): { faceBody: number[]; edgeBody: number[] } {
  const bodies = kernel.getSubShapes(shape, 'solid');
  const allFaces = kernel.getSubShapes(shape, 'face');
  const allEdges = kernel.getSubShapes(shape, 'edge');
  const faceBody = new Array(allFaces.length).fill(-1);
  const edgeBody = new Array(allEdges.length).fill(-1);

  const HASH_UPPER = 1 << 30;
  const faceByHash = new Map<number, number[]>();
  for (let i = 0; i < allFaces.length; i++) {
    const h = kernel.hashCode(allFaces[i], HASH_UPPER);
    const bucket = faceByHash.get(h);
    if (bucket) bucket.push(i);
    else faceByHash.set(h, [i]);
  }
  const edgeByHash = new Map<number, number[]>();
  for (let i = 0; i < allEdges.length; i++) {
    const h = kernel.hashCode(allEdges[i], HASH_UPPER);
    const bucket = edgeByHash.get(h);
    if (bucket) bucket.push(i);
    else edgeByHash.set(h, [i]);
  }

  for (let bi = 0; bi < bodies.length; bi++) {
    try {
      const bodyFaces = kernel.getSubShapes(bodies[bi], 'face');
      for (const bf of bodyFaces) {
        const candidates = faceByHash.get(kernel.hashCode(bf, HASH_UPPER));
        if (!candidates) continue;
        for (const fi of candidates) {
          if (kernel.isSame(allFaces[fi], bf)) {
            faceBody[fi] = bi;
            break;
          }
        }
      }
    } catch {
      /* body may not expose faces */
    }
    try {
      const bodyEdges = kernel.getSubShapes(bodies[bi], 'edge');
      for (const be of bodyEdges) {
        const candidates = edgeByHash.get(kernel.hashCode(be, HASH_UPPER));
        if (!candidates) continue;
        for (const ei of candidates) {
          if (kernel.isSame(allEdges[ei], be)) {
            edgeBody[ei] = bi;
            break;
          }
        }
      }
    } catch {
      /* body may not expose edges */
    }
  }

  return { faceBody, edgeBody };
}

/**
 * Extract deterministic edge entities from a STEP shape.
 * Each edge gets a stable ID like "edge:0", "edge:1", etc.
 * Based on traversal order from getSubShapes.
 */
export interface ExtractedEdgeEntity {
  id: string;
  index: number;
  curve_type: string;
  length: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  bbox_center: [number, number, number];
  start_point?: [number, number, number];
  end_point?: [number, number, number];
  radius?: number;
  body_id?: string;
  adjacent_faces?: Array<{
    face_id: string;
    surface_type: string;
  }>;
}

export function extractEdgeEntities(
  kernel: OcctKernel,
  shape: ShapeHandle,
  bodyMap?: { faceBody: number[]; edgeBody: number[] },
): ExtractedEdgeEntity[] {
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

    // Try to get start/end points if available.
    try {
      const params = kernel.curveParameters(edge);
      if (params && params.first !== undefined && params.last !== undefined) {
        const start = kernel.curvePointAtParam(edge, params.first);
        const end = kernel.curvePointAtParam(edge, params.last);
        if (start) entity.start_point = pointToTuple(start);
        if (end) entity.end_point = pointToTuple(end);
      }
    } catch {
      // If point extraction fails, continue without them.
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

/**
 * Extract deterministic face entities from a STEP shape.
 * Each face gets a stable ID like "face:0", "face:1", etc.
 */
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
  has_inner_wires?: boolean;
  adjacent_faces?: Array<{
    face_id: string;
    surface_type: string;
    dihedral_angle_deg: number;
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

    // Try to get surface normal at bbox_center (via UV surface parameters).
    try {
      const uv = kernel.uvFromPoint(face, { x: center[0], y: center[1], z: center[2] });
      if (uv) {
        const normal = kernel.surfaceNormal(face, uv.u, uv.v);
        if (normal) {
          entity.normal = pointToTuple(normal);
        }
      }
    } catch {
      // Normal extraction failed, continue without it.
    }

    // Try to get radius for cylindrical surfaces.
    if (surfaceType === 'cylinder') {
      try {
        const cylData = kernel.getFaceCylinderData(face);
        if (cylData && cylData.radius !== undefined) {
          entity.radius = cylData.radius;
        }
      } catch {
        // Radius extraction failed, continue without it.
      }

      // Extract cylinder axis direction and location.
      try {
        const axisData = kernel.getFaceCylinderAxis(face);
        if (axisData) {
          entity.axis = {
            direction: [axisData.direction.x, axisData.direction.y, axisData.direction.z],
            location: [axisData.location.x, axisData.location.y, axisData.location.z],
          };
        }
      } catch {
        // Axis extraction failed, continue without it.
      }
    }

    // Check if face has inner wires (holes/openings in the face boundary).
    try {
      const wires = kernel.getSubShapes(face, 'wire');
      entity.has_inner_wires = wires.length > 1;
    } catch {
      entity.has_inner_wires = false;
    }

    entity.body_id =
      bodyMap && bodyMap.faceBody[i] >= 0 ? makeId('body', bodyMap.faceBody[i]) : undefined;

    entities.push(entity);
  }

  return entities;
}
