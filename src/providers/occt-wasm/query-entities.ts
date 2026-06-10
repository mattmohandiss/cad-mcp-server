import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BoundingBox, Point3D } from '../schema.js';
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
  center: [number, number, number];
  start_point?: [number, number, number];
  end_point?: [number, number, number];
  radius?: number;
  adjacent_faces?: Array<{
    face_id: string;
    surface_type: string;
  }>;
}

export function extractEdgeEntities(kernel: OcctKernel, shape: ShapeHandle): ExtractedEdgeEntity[] {
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
      id: `edge:${i}`,
      index: i,
      curve_type: curveType,
      length,
      bbox,
      center,
    };

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

    entities.push(entity);
  }

  return entities;
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
  center: [number, number, number];
  normal?: [number, number, number];
  radius?: number;
  has_inner_wires?: boolean;
  adjacent_faces?: Array<{
    face_id: string;
    surface_type: string;
    vexity: string;
    dihedral_angle_deg: number;
  }>;
  closest_face_distance?: {
    face_id: string;
    distance: number;
  };
}

export function extractFaceEntities(kernel: OcctKernel, shape: ShapeHandle): ExtractedFaceEntity[] {
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
      id: `face:${i}`,
      index: i,
      surface_type: surfaceType,
      area,
      bbox,
      center,
    };

    // Try to get surface normal at center.
    try {
      const normal = kernel.surfaceNormal(face, center[0], center[1]);
      if (normal) {
        entity.normal = pointToTuple(normal);
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
    }

    // Check if face has inner wires (holes/openings in the face boundary).
    try {
      const wires = kernel.getSubShapes(face, 'wire');
      entity.has_inner_wires = wires.length > 1;
    } catch {
      entity.has_inner_wires = false;
    }

    entities.push(entity);
  }

  return entities;
}
