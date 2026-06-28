import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import { type ExtractedFaceEntity } from '../kernel/query-entities.js';
import { computeEdgeConvexity } from '../kernel/aag-utils.js';
import { normalizeVector, angleDegreesNormalized } from '../utils/vectors.js';
import { withStepModel } from '../model-store.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  groupEntities,
  magnitudeBucketKey,
  radiusBucketValue,
  axisDirectionKey,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';

export interface QueryFacesInput {
  surface_types?: string[];
  area_min?: number;
  area_max?: number;
  normal?: { parallel_to: number[]; tolerance_degrees?: number };
  body_ids?: string[];
  entity_ids?: string[];
  fields?: string[];
  group_by?: string[];
  sort?: { by: string; direction?: 'asc' | 'desc' };
  return_type?: 'summary' | 'entities' | 'groups';
  pull_direction?: number[];
  limit?: number;
  offset?: number;
}

export async function queryStepFaces(filePath: string, input: QueryFacesInput) {
  return withStepModel(filePath, async (model) => {
    const allFaces = await model.getFaceEntities();
    const { kernel, shape } = await model.getShapeContext('query_step_faces');

    let filtered = applyFaceFilters(allFaces, input);
    if (input.sort) {
      filtered = sortFaces(filtered, input.sort);
    }

    const resultMode = input.return_type ?? 'entities';
    const total_matched = filtered.length;

    const groups =
      resultMode === 'groups'
        ? groupFaces(filtered, input.group_by, DEFAULT_QUERY_LIMITS.sample_entity_limit)
        : [];

    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];

    const faceShapes = kernel.getSubShapes(shape, 'face');
    const adjacencies = buildFaceAdjacencies(kernel, shape, faceShapes, paginated, input.fields);
    const closestDistances = buildClosestFaceDistances(
      kernel,
      faceShapes,
      paginated,
      allFaces,
      input.fields,
    );

    const augmentedFaces = paginated.map((face) => ({
      ...face,
      ...(adjacencies ? { adjacent_faces: adjacencies.get(face.id) ?? [] } : {}),
      ...(closestDistances ? { closest_face_distance: closestDistances.get(face.id) } : {}),
    }));

    const entities = augmentedFaces.map((face) => projectFace(face, input.fields, input.pull_direction));
    const pagination = createPagination(limit, offset, paginated.length, total_matched);

    return createQueryResponse(
      filePath,
      {
        ...input,
        return_type: resultMode,
        limit,
        offset,
      },
      pagination,
      entities,
      {
        total_faces: allFaces.length,
        matched_faces: total_matched,
        surface_types: aggregateSurfaceTypes(filtered),
        area_range: getAreaRange(filtered),
      },
      groups,
      [],
      [],
    );
  });
}

/**
 * Build adjacency data for paginated faces using BRepGraph reverse indices.
 */
function buildFaceAdjacencies(
  kernel: OcctKernel,
  shape: ShapeHandle,
  faceShapes: ShapeHandle[],
  paginated: ExtractedFaceEntity[],
  fields: QueryFacesInput['fields'],
):
  | Map<
      string,
      Array<{
        face_id: string;
        surface_type: string;
        dihedral_angle_deg: number;
        shared_edge?: string;
        convexity?: string;
      }>
    >
  | undefined {
  if (!fields?.includes('adjacent_faces')) return undefined;

  const result = new Map<
    string,
    Array<{
      face_id: string;
      surface_type: string;
      dihedral_angle_deg: number;
      shared_edge?: string;
      convexity?: string;
    }>
  >();

  for (const face of paginated) {
    const idx = face.index;
    const faceShape = faceShapes[idx];
    const adjData = kernel.graphFaceAdjacency(idx);
    const entries: Array<{
      face_id: string;
      surface_type: string;
      dihedral_angle_deg: number;
      shared_edge?: string;
      convexity?: string;
    }> = [];

    // adjData encoding: [adjFace0, sharedEdge0, adjFace1, sharedEdge1, ...]
    for (let a = 0; a + 1 < adjData.length; a += 2) {
      const adjIdx = adjData[a];
      const sharedEdgeIdx = adjData[a + 1];
      if (adjIdx < 0 || adjIdx >= faceShapes.length) continue;

      const adjFaceShape = faceShapes[adjIdx];
      const sharedEdgeShape =
        sharedEdgeIdx >= 0 ? kernel.getSubShapes(shape, 'edge')[sharedEdgeIdx] : undefined;

      const sharedEdgeId = sharedEdgeIdx >= 0 ? `edge:${sharedEdgeIdx}` : undefined;
      const conv = sharedEdgeShape
        ? computeEdgeConvexity(kernel, faceShape, adjFaceShape, sharedEdgeShape)
        : { dihedral_angle_deg: 0, convexity: 'smooth' as const };

      entries.push({
        face_id: `face:${adjIdx}`,
        surface_type: kernel.surfaceType(adjFaceShape),
        dihedral_angle_deg: conv.dihedral_angle_deg,
        shared_edge: sharedEdgeId,
        convexity: conv.convexity,
      });
    }

    result.set(face.id, entries);
  }

  return result;
}

function buildClosestFaceDistances(
  kernel: OcctKernel,
  faceShapes: ShapeHandle[],
  paginated: ExtractedFaceEntity[],
  allFaces: ExtractedFaceEntity[],
  fields: QueryFacesInput['fields'],
): Map<string, { face_id: string; distance: number }> | undefined {
  if (!fields?.includes('closest_face_distance')) return undefined;

  const result = new Map<string, { face_id: string; distance: number }>();
  const allIndices = allFaces.map((f) => f.index);

  for (const face of paginated) {
    const idx = face.index;
    const faceShape = faceShapes[idx];
    let bestFace = '';
    let bestDist = Number.POSITIVE_INFINITY;

    for (const otherIdx of allIndices) {
      if (otherIdx === idx) continue;
      const dist = kernel.distanceBetween(faceShape, faceShapes[otherIdx]);
      if (dist < bestDist) {
        bestDist = dist;
        bestFace = `face:${otherIdx}`;
      }
    }

    result.set(face.id, {
      face_id: bestFace,
      distance: bestDist === Number.POSITIVE_INFINITY ? -1 : bestDist,
    });
  }

  return result;
}

function groupFaces(
  faces: ExtractedFaceEntity[],
  groupBy: QueryFacesInput['group_by'],
  sampleLimit: number | undefined,
): ComputedGroup[] {
  const dimensions = groupBy ?? ['surface_type'];
  const limit = sampleLimit ?? DEFAULT_QUERY_LIMITS.sample_entity_limit;

  return groupEntities(
    faces,
    dimensions,
    (face, dimension) => {
      switch (dimension) {
        case 'surface_type':
          return face.surface_type;
        case 'normal_direction':
          return face.normal ? axisDirectionKey(face.normal) : 'undefined';
        case 'area_range':
          return magnitudeBucketKey(face.area);
        case 'radius':
          return face.radius !== undefined ? radiusBucketValue(face.radius) : null;
        case 'body_id':
          return face.body_id ?? 'unknown';
        default:
          return null;
      }
    },
    limit,
    (members) => ({
      area_range: getAreaRange(members),
    }),
  );
}

export function applyFaceFilters(
  faces: ExtractedFaceEntity[],
  input: QueryFacesInput,
): ExtractedFaceEntity[] {
  let result = faces;

  if (input.entity_ids && input.entity_ids.length > 0) {
    const idSet = new Set(input.entity_ids);
    result = result.filter((f) => idSet.has(f.id));
  }

  if (input.body_ids && input.body_ids.length > 0) {
    const bodySet = new Set(input.body_ids);
    result = result.filter((f) => f.body_id !== undefined && bodySet.has(f.body_id));
  }

  if (input.surface_types && input.surface_types.length > 0) {
    const typeSet = new Set(input.surface_types);
    result = result.filter((f) => typeSet.has(f.surface_type as never));
  }

  if (input.area_min !== undefined) {
    result = result.filter((f) => f.area >= input.area_min!);
  }

  if (input.area_max !== undefined) {
    result = result.filter((f) => f.area <= input.area_max!);
  }

  if (input.normal?.parallel_to) {
    const targetNormal = normalizeVector(input.normal.parallel_to);
    const tolerance = input.normal.tolerance_degrees ?? 10;
    result = result.filter((f) => {
      if (!f.normal) return false;
      const faceNormal = normalizeVector(f.normal);
      const angle = angleDegreesNormalized(faceNormal, targetNormal);
      return Math.min(angle, 180 - angle) <= tolerance;
    });
  }

  return result;
}

export function sortFaces(
  faces: ExtractedFaceEntity[],
  sort: NonNullable<QueryFacesInput['sort']>,
): ExtractedFaceEntity[] {
  const sorted = [...faces];
  const direction = sort.direction === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.by) {
      case 'area':
        cmp = a.area - b.area;
        break;
      case 'surface_type':
        cmp = a.surface_type.localeCompare(b.surface_type);
        break;
      case 'center_x':
        cmp = a.bbox_center[0] - b.bbox_center[0];
        break;
      case 'center_y':
        cmp = a.bbox_center[1] - b.bbox_center[1];
        break;
      case 'center_z':
        cmp = a.bbox_center[2] - b.bbox_center[2];
        break;
    }
    return cmp * direction;
  });

  return sorted;
}

export function projectFace(
  face: ExtractedFaceEntity,
  fields: QueryFacesInput['fields'],
  pullDirection?: number[],
): Record<string, unknown> {
  const selected = fields ?? ['id', 'surface_type', 'area', 'bbox', 'bbox_center', 'body_id'];
  const result: Record<string, unknown> = {};

  // Always surface body_id when available (even if not explicitly requested).
  if (face.body_id !== undefined) result.body_id = face.body_id;

  // Compute draft angle when pull direction is provided.
  if (pullDirection && face.normal) {
    const pullLen = Math.sqrt(
      pullDirection[0] ** 2 + pullDirection[1] ** 2 + pullDirection[2] ** 2,
    );
    if (pullLen > 0) {
      const dot =
        (face.normal[0] * pullDirection[0] +
          face.normal[1] * pullDirection[1] +
          face.normal[2] * pullDirection[2]) /
        pullLen;
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
      result.draft_angle_deg = 90 - angleDeg;
    }
  }

  for (const field of selected) {
    switch (field) {
      case 'id':
        result.id = face.id;
        break;
      case 'surface_type':
        result.surface_type = face.surface_type;
        break;
      case 'area':
        result.area = face.area;
        break;
      case 'bbox':
        result.bbox = face.bbox;
        break;
      case 'bbox_center':
        result.bbox_center = face.bbox_center;
        break;
      case 'normal':
        if (face.normal !== undefined) result.normal = face.normal;
        break;
      case 'surface_parameters':
        if (face.radius !== undefined) {
          result.surface_parameters = { radius: face.radius };
        }
        break;
      case 'axis':
        if (face.axis !== undefined) result.axis = face.axis;
        break;
      case 'adjacent_faces':
        if (face.adjacent_faces !== undefined) result.adjacent_faces = face.adjacent_faces;
        break;
      case 'closest_face_distance':
        if (face.closest_face_distance !== undefined)
          result.closest_face_distance = face.closest_face_distance;
        break;
      case 'has_inner_wires':
        if (face.inner_wires !== undefined) result.has_inner_wires = face.inner_wires.length > 0;
        break;
      case 'body_id':
        // Already surfaced above; no-op.
        break;
      case 'outer_edges':
        if (face.outer_edges !== undefined) result.outer_edges = face.outer_edges;
        break;
      case 'inner_wires':
        if (face.inner_wires !== undefined) result.inner_wires = face.inner_wires;
        break;
    }
  }

  return result;
}

function aggregateSurfaceTypes(faces: ExtractedFaceEntity[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const face of faces) {
    agg[face.surface_type] = (agg[face.surface_type] ?? 0) + 1;
  }
  return agg;
}

function getAreaRange(faces: ExtractedFaceEntity[]): { min: number; max: number } | null {
  if (faces.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const face of faces) {
    if (face.area < min) min = face.area;
    if (face.area > max) max = face.area;
  }
  return { min, max };
}
