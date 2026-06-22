import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { QueryStepEdgesInput } from '../tools/step-tools.js';
import { type ExtractedEdgeEntity } from '../kernel/query-entities.js';
import { withStepModel } from '../model-store.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  groupEntities,
  magnitudeBucketKey,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';

/**
 * Query STEP file edges with filtering, sorting, and pagination.
 */
export async function queryStepEdges(filePath: string, input: QueryStepEdgesInput) {
  return withStepModel(filePath, async (model) => {
    const includeBodyId = Boolean(
      input.filter?.body_ids?.length ||
      input.include?.includes('body_id') ||
      input.group_by?.includes('body_id')
    );
    const allEdges = await model.getEdgeEntities(includeBodyId);
    const { kernel, shape } = await model.getShapeContext('query_step_edges');

    // Pre-filter by group_ids: resolve which entities belong to requested groups.
    let preFiltered = allEdges;
    if (input.filter?.group_ids && input.filter.group_ids.length > 0) {
      const groupBy = input.group_by;
      const preGroups = groupEdges(allEdges, groupBy, 0);
      const groupIdSet = new Set(input.filter.group_ids);
      const allowedIds = new Set<string>();
      for (const g of preGroups) {
        if (groupIdSet.has(g.id)) {
          for (const id of g.entity_ids) allowedIds.add(id);
        }
      }
      preFiltered = allEdges.filter((e) => allowedIds.has(e.id));
    }

    // Apply filters.
    let filtered = applyEdgeFilters(preFiltered, input.filter);

    // Apply sorting.
    if (input.sort) {
      filtered = sortEdges(filtered, input.sort);
    }

    const resultMode = input.result_mode ?? 'entities';
    const total_matched = filtered.length;

    // Grouping (result_mode "groups").
    const groups =
      resultMode === 'groups'
        ? groupEdges(filtered, input.group_by, DEFAULT_QUERY_LIMITS.sample_entity_limit)
        : [];

    // Pagination + projection (skipped for summary/groups modes to save tokens).
    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];

    // Compute edge-face adjacency on demand.
    const edgeAdjacencies = buildEdgeToFaceAdjacencies(kernel, shape, paginated, input.include);

    const augmentedEdges = paginated.map((edge) => ({
      ...edge,
      ...(edgeAdjacencies ? { adjacent_faces: edgeAdjacencies.get(edge.id) ?? [] } : {}),
    }));

    const entities = augmentedEdges.map((edge) => projectEdge(edge, input.include));
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
        total_edges: allEdges.length,
        matched_edges: total_matched,
        curve_types: aggregateCurveTypes(filtered),
        length_range: getLengthRange(filtered),
      },
      groups,
      [], // warnings
      [] // limitations
    );
  });
}

/**
 * Build edge-to-face adjacency map for paginated edges when requested.
 */
function buildEdgeToFaceAdjacencies(
  kernel: OcctKernel,
  shape: ShapeHandle,
  paginated: ExtractedEdgeEntity[],
  include: QueryStepEdgesInput['include']
): Map<string, Array<{ face_id: string; surface_type: string }>> | undefined {
  if (!include?.includes('adjacent_faces')) return undefined;

  const edgeShapes = kernel.getSubShapes(shape, 'edge');
  const faceShapes = kernel.getSubShapes(shape, 'face');
  const result = new Map<string, Array<{ face_id: string; surface_type: string }>>();

  for (const edge of paginated) {
    const edgeShape = edgeShapes[edge.index];
    const entries: Array<{ face_id: string; surface_type: string }> = [];

    for (let fi = 0; fi < faceShapes.length; fi++) {
      const faceEdgeShapes = kernel.getSubShapes(faceShapes[fi], 'edge');
      const containsEdge = faceEdgeShapes.some((fe) => kernel.isSame(fe, edgeShape));
      if (containsEdge) {
        entries.push({
          face_id: `face:${fi}`,
          surface_type: kernel.surfaceType(faceShapes[fi]),
        });
        if (entries.length === 2) break; // An edge bounds at most 2 faces
      }
    }

    result.set(edge.id, entries);
  }

  return result;
}

/**
 * Group edges by the requested dimensions using fixed server-side buckets.
 */
function groupEdges(
  edges: ExtractedEdgeEntity[],
  groupBy: QueryStepEdgesInput['group_by'],
  sampleLimit: number | undefined
): ComputedGroup[] {
  const dimensions = groupBy ?? ['curve_type'];
  const limit = sampleLimit ?? DEFAULT_QUERY_LIMITS.sample_entity_limit;

  return groupEntities(
    edges,
    dimensions,
    (edge, dimension) => {
      switch (dimension) {
        case 'curve_type':
          return edge.curve_type;
        case 'length_range':
          return magnitudeBucketKey(edge.length);
        case 'body_id':
          return edge.body_id ?? 'unknown';
        default:
          return null;
      }
    },
    limit,
    (members) => ({
      length_range: getLengthRange(members),
    })
  );
}

/**
 * Apply edge filters to a set of edges.
 */
function applyEdgeFilters(
  edges: ExtractedEdgeEntity[],
  filter: QueryStepEdgesInput['filter']
): ExtractedEdgeEntity[] {
  let result = edges;

  if (filter) {
    if (filter.entity_ids && filter.entity_ids.length > 0) {
      const idSet = new Set(filter.entity_ids);
      result = result.filter((e) => idSet.has(e.id));
    }

    if (filter.body_ids && filter.body_ids.length > 0) {
      const bodySet = new Set(filter.body_ids);
      result = result.filter((e) => e.body_id !== undefined && bodySet.has(e.body_id));
    }

    if (filter.curve_type && filter.curve_type.length > 0) {
      const typeSet = new Set(filter.curve_type);
      result = result.filter((e) => typeSet.has(e.curve_type as never));
    }

    if (filter.length_min !== undefined) {
      result = result.filter((e) => e.length >= filter.length_min!);
    }

    if (filter.length_max !== undefined) {
      result = result.filter((e) => e.length <= filter.length_max!);
    }

    if (filter.radius_min !== undefined) {
      result = result.filter((e) => e.radius !== undefined && e.radius >= filter.radius_min!);
    }

    if (filter.radius_max !== undefined) {
      result = result.filter((e) => e.radius !== undefined && e.radius <= filter.radius_max!);
    }
  }

  return result;
}

/**
 * Sort edges by the specified criteria.
 */
function sortEdges(
  edges: ExtractedEdgeEntity[],
  sort: NonNullable<QueryStepEdgesInput['sort']>
): ExtractedEdgeEntity[] {
  const sorted = [...edges];
  const direction = sort.direction === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.by) {
      case 'length':
        cmp = a.length - b.length;
        break;
      case 'curve_type':
        cmp = a.curve_type.localeCompare(b.curve_type);
        break;
      case 'radius':
        cmp = (a.radius ?? 0) - (b.radius ?? 0);
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
 * Project an edge to only the requested include fields.
 */
function projectEdge(
  edge: ExtractedEdgeEntity,
  include: QueryStepEdgesInput['include']
): Record<string, unknown> {
  const fields = include ?? ['id', 'curve_type', 'length', 'bbox', 'center'];
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field) {
      case 'id':
        result.id = edge.id;
        break;
      case 'curve_type':
        result.curve_type = edge.curve_type;
        break;
      case 'length':
        result.length = edge.length;
        break;
      case 'bbox':
        result.bbox = edge.bbox;
        break;
      case 'center':
        result.bbox_center = edge.center;
        break;
      case 'radius':
        if (edge.radius !== undefined) result.radius = edge.radius;
        break;
      case 'start_point':
        if (edge.start_point !== undefined) result.start_point = edge.start_point;
        break;
      case 'end_point':
        if (edge.end_point !== undefined) result.end_point = edge.end_point;
        break;
      case 'adjacent_faces':
        if (edge.adjacent_faces !== undefined) result.adjacent_faces = edge.adjacent_faces;
        break;
      case 'body_id':
        if (edge.body_id !== undefined) result.body_id = edge.body_id;
        break;
    }
  }

  return result;
}

/**
 * Aggregate curve types in a set of edges.
 */
function aggregateCurveTypes(edges: ExtractedEdgeEntity[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const edge of edges) {
    agg[edge.curve_type] = (agg[edge.curve_type] ?? 0) + 1;
  }
  return agg;
}

/**
 * Get length range of edges.
 */
function getLengthRange(edges: ExtractedEdgeEntity[]): { min: number; max: number } | null {
  if (edges.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const edge of edges) {
    if (edge.length < min) min = edge.length;
    if (edge.length > max) max = edge.length;
  }
  return { min, max };
}
