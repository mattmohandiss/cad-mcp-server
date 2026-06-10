import type { QueryStepFacesInput } from '../../tools/step-tools.js';
import { withImportedStep } from '../../providers/occt-wasm/import.js';
import {
  extractFaceEntities,
  type ExtractedFaceEntity,
} from '../../providers/occt-wasm/query-entities.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  pointDistance,
  bboxIntersects,
  normalizeVector,
  angleDegreesNormalized,
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
  return withImportedStep(filePath, 'query_step_faces', (kernel, shape) => {
    // Extract all face entities from the STEP file.
    const allFaces = extractFaceEntities(kernel, shape);

    // Apply filters.
    let filtered = applyFaceFilters(allFaces, input.filter, input.region, input.near);

    // Apply sorting.
    if (input.sort) {
      filtered = sortFaces(filtered, input.sort);
    }

    const resultMode = input.result_mode ?? 'entities';
    const total_matched = filtered.length;

    // Grouping (result_mode "groups").
    const groups =
      resultMode === 'groups'
        ? groupFaces(filtered, input.group_by, input.sample_entity_limit)
        : [];

    // Pagination + projection (skipped for summary/groups modes to save tokens).
    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];
    const entities = paginated.map((face) => projectFace(face, input.include));
    const pagination = createPagination(limit, offset, paginated.length, total_matched);

    return createQueryResponse(
      filePath,
      {
        filter: input.filter ?? {},
        region: input.region ?? null,
        near: input.near ?? null,
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
  filter: QueryStepFacesInput['filter'],
  region: QueryStepFacesInput['region'],
  near: QueryStepFacesInput['near']
): ExtractedFaceEntity[] {
  let result = faces;

  if (filter) {
    if (filter.entity_ids && filter.entity_ids.length > 0) {
      const idSet = new Set(filter.entity_ids);
      result = result.filter((f) => idSet.has(f.id));
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

  if (region) {
    const mode = region.mode ?? 'intersects';
    result = result.filter((f) => {
      if (mode === 'contained') {
        return (
          f.bbox.min[0] >= region.bbox.min[0] &&
          f.bbox.max[0] <= region.bbox.max[0] &&
          f.bbox.min[1] >= region.bbox.min[1] &&
          f.bbox.max[1] <= region.bbox.max[1] &&
          f.bbox.min[2] >= region.bbox.min[2] &&
          f.bbox.max[2] <= region.bbox.max[2]
        );
      } else if (mode === 'contains_center') {
        return (
          f.center[0] >= region.bbox.min[0] &&
          f.center[0] <= region.bbox.max[0] &&
          f.center[1] >= region.bbox.min[1] &&
          f.center[1] <= region.bbox.max[1] &&
          f.center[2] >= region.bbox.min[2] &&
          f.center[2] <= region.bbox.max[2]
        );
      } else {
        // intersects
        return bboxIntersects(f.bbox, region.bbox);
      }
    });
  }

  if (near) {
    result = result.filter((f) => {
      const dist = pointDistance(f.center, near.point);
      return dist <= near.distance;
    });
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
        result.center = face.center;
        break;
      case 'normal':
        if (face.normal !== undefined) result.normal = face.normal;
        break;
      case 'surface_parameters':
        // Surface-specific parameters like radius for cylinders.
        result.surface_parameters = face.radius ? { radius: face.radius } : {};
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
