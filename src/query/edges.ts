import type { OcctKernel, ShapeHandle } from 'occt-wasm';
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

export interface QueryEdgesInput {
  curve_types?: string[];
  length_min?: number;
  length_max?: number;
  radius?: { min?: number; max?: number };
  body_ids?: string[];
  entity_ids?: string[];
  fields?: string[];
  group_by?: string[];
  sort?: { by: string; direction?: 'asc' | 'desc' };
  return_type?: 'summary' | 'entities' | 'groups';
  limit?: number;
  offset?: number;
}

export async function queryStepEdges(filePath: string, input: QueryEdgesInput) {
  return withStepModel(filePath, async (model) => {
    const allEdges = await model.getEdgeEntities();
    const { kernel, shape } = await model.getShapeContext('query_step_edges');

    let filtered = applyEdgeFilters(allEdges, input);
    if (input.sort) {
      filtered = sortEdges(filtered, input.sort);
    }

    const resultMode = input.return_type ?? 'entities';
    const total_matched = filtered.length;

    const groups =
      resultMode === 'groups'
        ? groupEdges(filtered, input.group_by, DEFAULT_QUERY_LIMITS.sample_entity_limit)
        : [];

    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];

    const edgeAdjacencies = buildEdgeToFaceAdjacencies(kernel, shape, paginated, input.fields);

    const augmentedEdges = paginated.map((edge) => ({
      ...edge,
      ...(edgeAdjacencies ? { adjacent_faces: edgeAdjacencies.get(edge.id) ?? [] } : {}),
    }));

    const entities = augmentedEdges.map((edge) => projectEdge(edge, input.fields));
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
        total_edges: allEdges.length,
        matched_edges: total_matched,
        curve_types: aggregateCurveTypes(filtered),
        length_range: getLengthRange(filtered),
      },
      groups,
      [],
      [],
    );
  });
}

/**
 * Build edge-to-face adjacency map for paginated edges using BRepGraph.
 */
function buildEdgeToFaceAdjacencies(
  kernel: OcctKernel,
  shape: ShapeHandle,
  paginated: ExtractedEdgeEntity[],
  fields: QueryEdgesInput['fields'],
): Map<string, Array<{ face_id: string; surface_type: string }>> | undefined {
  if (!fields?.includes('adjacent_faces')) return undefined;

  const faceShapes = kernel.getSubShapes(shape, 'face');

  const result = new Map<string, Array<{ face_id: string; surface_type: string }>>();

  for (const edge of paginated) {
    const faceIndices = kernel.graphEdgeFaces(edge.index);
    const entries: Array<{ face_id: string; surface_type: string }> = [];
    for (const fi of faceIndices) {
      if (fi < 0 || fi >= faceShapes.length) continue;
      entries.push({
        face_id: `face:${fi}`,
        surface_type: kernel.surfaceType(faceShapes[fi]),
      });
      if (entries.length === 2) break;
    }
    result.set(edge.id, entries);
  }

  return result;
}

function groupEdges(
  edges: ExtractedEdgeEntity[],
  groupBy: QueryEdgesInput['group_by'],
  sampleLimit: number | undefined,
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
    }),
  );
}

function applyEdgeFilters(
  edges: ExtractedEdgeEntity[],
  input: QueryEdgesInput,
): ExtractedEdgeEntity[] {
  let result = edges;

  if (input.entity_ids && input.entity_ids.length > 0) {
    const idSet = new Set(input.entity_ids);
    result = result.filter((e) => idSet.has(e.id));
  }

  if (input.body_ids && input.body_ids.length > 0) {
    const bodySet = new Set(input.body_ids);
    result = result.filter((e) => e.body_id !== undefined && bodySet.has(e.body_id));
  }

  if (input.curve_types && input.curve_types.length > 0) {
    const typeSet = new Set(input.curve_types);
    result = result.filter((e) => typeSet.has(e.curve_type as never));
  }

  if (input.length_min !== undefined) {
    result = result.filter((e) => e.length >= input.length_min!);
  }

  if (input.length_max !== undefined) {
    result = result.filter((e) => e.length <= input.length_max!);
  }

  if (input.radius?.min !== undefined) {
    result = result.filter((e) => e.radius !== undefined && e.radius >= input.radius!.min!);
  }

  if (input.radius?.max !== undefined) {
    result = result.filter((e) => e.radius !== undefined && e.radius <= input.radius!.max!);
  }

  return result;
}

function sortEdges(
  edges: ExtractedEdgeEntity[],
  sort: NonNullable<QueryEdgesInput['sort']>,
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

function projectEdge(
  edge: ExtractedEdgeEntity,
  fields: QueryEdgesInput['fields'],
): Record<string, unknown> {
  const selected = fields ?? ['id', 'curve_type', 'length', 'bbox', 'bbox_center', 'body_id'];
  const result: Record<string, unknown> = {};

  // Always surface body_id when available.
  if (edge.body_id !== undefined) result.body_id = edge.body_id;

  for (const field of selected) {
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
      case 'bbox_center':
        result.bbox_center = edge.bbox_center;
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
      case 'start_vertex':
        if (edge.start_vertex !== undefined) result.start_vertex = edge.start_vertex;
        break;
      case 'end_vertex':
        if (edge.end_vertex !== undefined) result.end_vertex = edge.end_vertex;
        break;
      case 'convexity':
        if (edge.convexity !== undefined) result.convexity = edge.convexity;
        break;
      case 'adjacent_faces':
        if (edge.adjacent_faces !== undefined) result.adjacent_faces = edge.adjacent_faces;
        break;
      case 'body_id':
        // Already surfaced above; no-op.
        break;
    }
  }

  return result;
}

function aggregateCurveTypes(edges: ExtractedEdgeEntity[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const edge of edges) {
    agg[edge.curve_type] = (agg[edge.curve_type] ?? 0) + 1;
  }
  return agg;
}

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
