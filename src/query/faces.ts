import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { QueryStepFacesInput } from '../tools/step-tools.js';
import { type ExtractedFaceEntity } from '../kernel/query-entities.js';
import { computeEdgeVexity } from '../kernel/aag-utils.js';
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

/**
 * Query STEP file faces with filtering, sorting, and pagination.
 */
export async function queryStepFaces(filePath: string, input: QueryStepFacesInput) {
  return withStepModel(filePath, async (model) => {
    const includeBodyId = Boolean(
      input.filter?.body_ids?.length ||
      input.include?.includes('body_id') ||
      input.group_by?.includes('body_id')
    );
    const allFaces = await model.getFaceEntities(includeBodyId);
    const { kernel, shape } = await model.getShapeContext('query_step_faces');

    // Pre-filter by group_ids: resolve which entities belong to requested groups.
    let preFiltered = allFaces;
    if (input.filter?.group_ids && input.filter.group_ids.length > 0) {
      const groupBy = input.group_by;
      const preGroups = groupFaces(allFaces, groupBy, 0);
      const groupIdSet = new Set(input.filter.group_ids);
      const allowedIds = new Set<string>();
      for (const g of preGroups) {
        if (groupIdSet.has(g.id)) {
          for (const id of g.entity_ids) allowedIds.add(id);
        }
      }
      preFiltered = allFaces.filter((f) => allowedIds.has(f.id));
    }

    // Apply filters.
    let filtered = applyFaceFilters(preFiltered, input.filter);

    // Apply sorting.
    if (input.sort) {
      filtered = sortFaces(filtered, input.sort);
    }

    const resultMode = input.result_mode ?? 'entities';
    const total_matched = filtered.length;

    // Grouping (result_mode "groups").
    const groups =
      resultMode === 'groups'
        ? groupFaces(filtered, input.group_by, DEFAULT_QUERY_LIMITS.sample_entity_limit)
        : [];

    // Pagination + projection (skipped for summary/groups modes to save tokens).
    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];

    // Compute adjacency and closest-face-distance for paginated faces on demand.
    const faceShapes = kernel.getSubShapes(shape, 'face');
    const adjacencies = buildFaceAdjacencies(kernel, shape, faceShapes, paginated, input.include);
    const closestDistances = buildClosestFaceDistances(
      kernel,
      faceShapes,
      paginated,
      allFaces,
      input.include
    );

    const augmentedFaces = paginated.map((face) => ({
      ...face,
      ...(adjacencies ? { adjacent_faces: adjacencies.get(face.id) ?? [] } : {}),
      ...(closestDistances ? { closest_face_distance: closestDistances.get(face.id) } : {}),
    }));

    const entities = augmentedFaces.map((face) => projectFace(face, input.include));
    const pagination = createPagination(limit, offset, paginated.length, total_matched);

    return createQueryResponse(
      filePath,
      {
        filter: input.filter ?? {},
        include: input.include ?? [],
        group_by: input.group_by ?? null,
        result_mode: resultMode,
        sort: input.sort ?? null,
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
      [], // warnings
      [] // limitations
    );
  });
}

/**
 * Build adjacency data for paginated faces when requested via include.
 */
function buildFaceAdjacencies(
  kernel: OcctKernel,
  shape: ShapeHandle,
  faceShapes: ShapeHandle[],
  paginated: ExtractedFaceEntity[],
  include: QueryStepFacesInput['include']
):
  | Map<string, Array<{ face_id: string; surface_type: string; dihedral_angle_deg: number }>>
  | undefined {
  if (!include?.includes('adjacent_faces')) return undefined;

  const result = new Map<
    string,
    Array<{ face_id: string; surface_type: string; dihedral_angle_deg: number }>
  >();

  for (const face of paginated) {
    const idx = face.index;
    const faceShape = faceShapes[idx];
    const adjacent = kernel.adjacentFaces(shape, faceShape);
    const entries: Array<{
      face_id: string;
      surface_type: string;
      dihedral_angle_deg: number;
    }> = [];

    for (const adjFace of adjacent) {
      const adjIdx = faceShapes.findIndex((s) => kernel.isSame(s, adjFace));
      if (adjIdx === -1) continue;
      const sharedEdges = kernel.sharedEdges(faceShape, adjFace);
      if (sharedEdges.length === 0) continue;

      const vexityResult = computeEdgeVexity(kernel, faceShape, adjFace, sharedEdges[0]);
      entries.push({
        face_id: `face:${adjIdx}`,
        surface_type: kernel.surfaceType(adjFace),
        dihedral_angle_deg: vexityResult.dihedralAngleDeg,
      });
    }

    result.set(face.id, entries);
  }

  return result;
}

/**
 * Compute closest face distance for each paginated face when requested.
 */
function buildClosestFaceDistances(
  kernel: OcctKernel,
  faceShapes: ShapeHandle[],
  paginated: ExtractedFaceEntity[],
  allFaces: ExtractedFaceEntity[],
  include: QueryStepFacesInput['include']
): Map<string, { face_id: string; distance: number }> | undefined {
  if (!include?.includes('closest_face_distance')) return undefined;

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

/**
 * Group faces by the requested dimensions using fixed server-side buckets.
 */
function groupFaces(
  faces: ExtractedFaceEntity[],
  groupBy: QueryStepFacesInput['group_by'],
  sampleLimit: number | undefined
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
    })
  );
}

/**
 * Apply face filters to a set of faces.
 */
function applyFaceFilters(
  faces: ExtractedFaceEntity[],
  filter: QueryStepFacesInput['filter']
): ExtractedFaceEntity[] {
  let result = faces;

  if (filter) {
    if (filter.entity_ids && filter.entity_ids.length > 0) {
      const idSet = new Set(filter.entity_ids);
      result = result.filter((f) => idSet.has(f.id));
    }

    if (filter.body_ids && filter.body_ids.length > 0) {
      const bodySet = new Set(filter.body_ids);
      result = result.filter((f) => f.body_id !== undefined && bodySet.has(f.body_id));
    }

    if (filter.surface_type && filter.surface_type.length > 0) {
      const typeSet = new Set(filter.surface_type);
      result = result.filter((f) => typeSet.has(f.surface_type as never));
    }

    if (filter.area_min !== undefined) {
      result = result.filter((f) => f.area >= filter.area_min!);
    }

    if (filter.area_max !== undefined) {
      result = result.filter((f) => f.area <= filter.area_max!);
    }

    // Normal parallel to filter.
    if (filter.normal_parallel_to) {
      const targetNormal = normalizeVector(filter.normal_parallel_to);
      const tolerance = filter.normal_tolerance_degrees ?? 10;
      result = result.filter((f) => {
        if (!f.normal) return false;
        const faceNormal = normalizeVector(f.normal);
        const angle = angleDegreesNormalized(faceNormal, targetNormal);
        // Allow angle or 180-angle (opposite direction).
        return Math.min(angle, 180 - angle) <= tolerance;
      });
    }
  }

  return result;
}

/**
 * Sort faces by the specified criteria.
 */
function sortFaces(
  faces: ExtractedFaceEntity[],
  sort: NonNullable<QueryStepFacesInput['sort']>
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
        cmp = a.center[0] - b.center[0];
        break;
      case 'center_y':
        cmp = a.center[1] - b.center[1];
        break;
      case 'center_z':
        cmp = a.center[2] - b.center[2];
        break;
    }
    return cmp * direction;
  });

  return sorted;
}

/**
 * Project a face to only the requested include fields.
 */
function projectFace(
  face: ExtractedFaceEntity,
  include: QueryStepFacesInput['include']
): Record<string, unknown> {
  const fields = include ?? ['id', 'surface_type', 'area', 'bbox', 'center'];
  const result: Record<string, unknown> = {};

  for (const field of fields) {
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
      case 'center':
        result.bbox_center = face.center;
        break;
      case 'normal':
        if (face.normal !== undefined) result.normal = face.normal;
        break;
      case 'surface_parameters':
        // Surface-specific parameters like radius for cylinders.
        result.surface_parameters = face.radius !== undefined ? { radius: face.radius } : {};
        break;
      case 'adjacent_faces':
        if (face.adjacent_faces !== undefined) result.adjacent_faces = face.adjacent_faces;
        break;
      case 'closest_face_distance':
        if (face.closest_face_distance !== undefined)
          result.closest_face_distance = face.closest_face_distance;
        break;
      case 'has_inner_wires':
        if (face.has_inner_wires !== undefined) result.has_inner_wires = face.has_inner_wires;
        break;
      case 'body_id':
        if (face.body_id !== undefined) result.body_id = face.body_id;
        break;
    }
  }

  return result;
}

/**
 * Aggregate surface types in a set of faces.
 */
function aggregateSurfaceTypes(faces: ExtractedFaceEntity[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const face of faces) {
    agg[face.surface_type] = (agg[face.surface_type] ?? 0) + 1;
  }
  return agg;
}

/**
 * Get area range of faces.
 */
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
