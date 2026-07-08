import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import { EDGE_DEFAULT_SELECT_FIELDS } from '../public-contract.js';
import { type ExtractedEdgeEntity } from '../kernel/query-entities.js';
import { withStepModel } from '../model-store.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  groupEntities,
  magnitudeBucketKey,
  radiusBucketValue,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';
import { applyAggregate } from './aggregate.js';

export interface QueryEdgesInput {
  where?: Record<string, unknown>;
  entity_ids?: string[];
  select?: string[];
  group_by?: string[];
  order_by?: { by: string; direction?: 'asc' | 'desc' };
  return_type?: 'summary' | 'entities' | 'groups';
  aggregate?: string[];
  limit?: number;
  offset?: number;
}

export async function queryStepEdges(filePath: string, input: QueryEdgesInput) {
  return withStepModel(filePath, async (model) => {
    const allEdges = await model.getEdgeEntities();
    const { kernel, shape } = await model.getShapeContext('query_step_edges');

    let filtered = applyEdgeFilters(allEdges, input);

    // Enrich raw entities with computed fields (e.g. diameter) so sorting
    // and aggregation work on the same data that projectEdge produces.
    const enriched = filtered.map((edge) => enrichEdge(edge));

    if (input.order_by) {
      sortEdgesInPlace(enriched, input.order_by);
    }

    const resultMode = input.return_type ?? 'entities';
    const total_matched = enriched.length;

    const groups =
      resultMode === 'groups'
        ? groupEdges(enriched, input.group_by, DEFAULT_QUERY_LIMITS.sample_entity_limit)
        : [];

    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const includeEntities = resultMode === 'entities';
    const paginated = includeEntities ? enriched.slice(offset, offset + limit) : [];

    const edgeAdjacencies = buildEdgeToFaceAdjacencies(kernel, shape, paginated, input.select);

    const augmentedEdges = paginated.map((edge) => ({
      ...edge,
      ...(edgeAdjacencies ? { adjacent_faces: edgeAdjacencies.get(edge.id) ?? [] } : {}),
    }));

    const entities = augmentedEdges.map((edge) => projectEdge(edge, input.select));
    const pagination = createPagination(limit, offset, paginated.length, total_matched);

    const baseStats: Record<string, unknown> = {
      total_edges: allEdges.length,
      matched_edges: total_matched,
      curve_types: aggregateCurveTypes(enriched),
      length_range: getLengthRange(enriched),
    };
    applyAggregate(baseStats, enriched as unknown as Record<string, unknown>[], input.aggregate);

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
      baseStats,
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
  fields: QueryEdgesInput['select'],
): Map<string, Array<{ face_id: string; surface_type: string }>> | undefined {
  if (!selectedEdgeFields(fields).includes('adjacent_faces')) return undefined;

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
        case 'radius_range':
          return edge.radius !== undefined ? radiusBucketValue(edge.radius) : null;
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

export function applyEdgeFilters(
  edges: ExtractedEdgeEntity[],
  input: QueryEdgesInput,
): ExtractedEdgeEntity[] {
  let result = edges;
  const where = input.where ?? {};

  if (input.entity_ids && input.entity_ids.length > 0) {
    const idSet = new Set(input.entity_ids);
    result = result.filter((e) => idSet.has(e.id));
  }

  const bodyIds = Array.isArray(where.body_ids) ? where.body_ids : undefined;
  if (bodyIds && bodyIds.length > 0) {
    const bodySet = new Set(bodyIds);
    result = result.filter((e) => e.body_id !== undefined && bodySet.has(e.body_id));
  }

  if (typeof where.curve_type === 'string') {
    result = result.filter((e) => e.curve_type === where.curve_type);
  }

  const lengthMin = where.length_min;
  if (typeof lengthMin === 'number') {
    result = result.filter((e) => e.length >= lengthMin);
  }

  const lengthMax = where.length_max;
  if (typeof lengthMax === 'number') {
    result = result.filter((e) => e.length <= lengthMax);
  }

  const radiusMin = where.radius_min;
  if (typeof radiusMin === 'number') {
    result = result.filter((e) => e.radius !== undefined && e.radius >= radiusMin);
  }

  const radiusMax = where.radius_max;
  if (typeof radiusMax === 'number') {
    result = result.filter((e) => e.radius !== undefined && e.radius <= radiusMax);
  }

  const dihedralMin = where.dihedral_min_deg;
  if (typeof dihedralMin === 'number') {
    result = result.filter(
      (e) => e.dihedral_angle_deg !== undefined && e.dihedral_angle_deg >= dihedralMin,
    );
  }

  return result;
}

function enrichEdge(edge: ExtractedEdgeEntity): ExtractedEdgeEntity & { diameter?: number } {
  return {
    ...edge,
    diameter: edge.radius !== undefined ? edge.radius * 2 : undefined,
  };
}

export function sortEdgesInPlace(
  edges: (ExtractedEdgeEntity & { diameter?: number })[],
  sort: NonNullable<QueryEdgesInput['order_by']>,
): void {
  const direction = sort.direction === 'desc' ? -1 : 1;
  edges.sort((a, b) => {
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
      case 'diameter':
        cmp = (a.diameter ?? 0) - (b.diameter ?? 0);
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
}

export function sortEdges(
  edges: ExtractedEdgeEntity[],
  sort: NonNullable<QueryEdgesInput['order_by']>,
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
      case 'diameter':
        cmp = (a.radius ?? 0) * 2 - (b.radius ?? 0) * 2;
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

export function projectEdge(
  edge: ExtractedEdgeEntity,
  fields: QueryEdgesInput['select'],
): Record<string, unknown> {
  const selected = selectedEdgeFields(fields);
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
      case 'diameter':
        if (edge.radius !== undefined) result.diameter = edge.radius * 2;
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
      case 'dihedral_angle_deg':
        if (edge.dihedral_angle_deg !== undefined)
          result.dihedral_angle_deg = edge.dihedral_angle_deg;
        break;
      case 'continuity':
        if (edge.continuity !== undefined) result.continuity = edge.continuity;
        break;
      case 'is_closed':
        if (edge.is_closed !== undefined) result.is_closed = edge.is_closed;
        break;
      case 'is_periodic':
        if (edge.is_periodic !== undefined) result.is_periodic = edge.is_periodic;
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

function selectedEdgeFields(fields: QueryEdgesInput['select']): readonly string[] {
  return fields ?? EDGE_DEFAULT_SELECT_FIELDS;
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
