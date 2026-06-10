import type { QueryStepFeaturesInput } from '../../tools/step-tools.js';
import { analyzeStepFile } from '../analyze.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  pointDistance,
  bboxIntersects,
  groupEntities,
  magnitudeBucketKey,
  radiusBucketValue,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';

/**
 * Extracted feature entity with geometric properties.
 */
interface ExtractedFeatureEntity {
  id: string;
  feature_type: string;
  confidence: number;
  bbox?: { min: [number, number, number]; max: [number, number, number] };
  center?: [number, number, number];
  parameters?: Record<string, unknown>;
  source_faces?: string[];
}

/**
 * Query STEP file features with filtering, sorting, and pagination.
 */
export async function queryStepFeatures(filePath: string, input: QueryStepFeaturesInput) {
  // Analyze the file to get feature candidates from AAG provider.
  const graph = await analyzeStepFile(filePath);

  // Extract features from AAG and B-rep providers.
  const allFeatures = extractFeatures(graph);

  // Filter by requested feature types.
  let filtered = allFeatures;
  if (input.feature_type && input.feature_type.length > 0) {
    const typeSet = new Set(input.feature_type);
    filtered = filtered.filter((f) => typeSet.has(f.feature_type as never));
  }

  // Apply additional filters.
  filtered = applyFeatureFilters(filtered, input.filter, input.region, input.near);

  // Apply sorting.
  if (input.sort) {
    filtered = sortFeatures(filtered, input.sort);
  }

  const resultMode = input.result_mode ?? 'entities';
  const total_matched = filtered.length;

  // Grouping (result_mode "groups").
  const groups =
    resultMode === 'groups'
      ? groupFeatures(filtered, input.group_by, input.sample_entity_limit)
      : [];

  // Pagination + projection (skipped for summary/groups modes to save tokens).
  const { limit, offset } = normalizePagination(input.limit, input.offset);
  const includeEntities = resultMode === 'entities';
  const paginated = includeEntities ? filtered.slice(offset, offset + limit) : [];
  const entities = paginated.map((feature) => projectFeature(feature, input.include));
  const pagination = createPagination(limit, offset, paginated.length, total_matched);

  return createQueryResponse(
    filePath,
    {
      feature_type: input.feature_type ?? [],
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
      total_features: allFeatures.length,
      matched_features: total_matched,
      feature_types: aggregateFeatureTypes(filtered),
      confidence_range: getConfidenceRange(filtered),
    },
    groups,
    graph.warnings,
    graph.limitations
  );
}

/**
 * Group features by the requested dimensions using fixed server-side buckets.
 */
function groupFeatures(
  features: ExtractedFeatureEntity[],
  groupBy: QueryStepFeaturesInput['group_by'],
  sampleLimit: number | undefined
): ComputedGroup[] {
  const dimensions = groupBy ?? ['feature_type'];
  const limit = sampleLimit ?? DEFAULT_QUERY_LIMITS.sample_entity_limit;

  return groupEntities(
    features,
    dimensions,
    (feature, dimension) => {
      const params = feature.parameters ?? {};
      switch (dimension) {
        case 'feature_type':
          return feature.feature_type;
        case 'through':
          return typeof params.through === 'boolean' ? params.through : null;
        case 'diameter':
          return typeof params.diameter === 'number' ? radiusBucketValue(params.diameter) : null;
        case 'radius':
          return typeof params.radius === 'number' ? radiusBucketValue(params.radius) : null;
        case 'depth_range':
          return typeof params.depth === 'number' ? magnitudeBucketKey(params.depth) : null;
        default:
          return null;
      }
    },
    limit,
    (members) => ({
      confidence_range: getConfidenceRange(members),
    })
  );
}

/**
 * Extract feature entities from the knowledge graph.
 */
function extractFeatures(graph: { inferences: unknown[] }): ExtractedFeatureEntity[] {
  const features: ExtractedFeatureEntity[] = [];

  // Features come from inferences in the knowledge graph.
  const inferences = graph.inferences as Array<{
    id?: string;
    type?: string;
    category?: string;
    value?: Record<string, unknown>;
  }>;

  for (const inference of inferences) {
    if (inference.category !== 'features') continue;

    const featureType = inference.type ?? 'unknown';
    // Map old type names to new canonical names.
    const mappedType = mapFeatureType(featureType);

    const feature: ExtractedFeatureEntity = {
      id: inference.id ?? `feature:${features.length}`,
      feature_type: mappedType,
      confidence: 0.5, // Default confidence, should come from evidence.
    };

    // Extract any geometric properties from the value.
    if (inference.value && typeof inference.value === 'object') {
      const value = inference.value as Record<string, unknown>;
      if (typeof value.confidence === 'number') {
        feature.confidence = value.confidence;
      }
      if (typeof value.parameters === 'object') {
        feature.parameters = value.parameters as Record<string, unknown>;
      } else {
        feature.parameters = {};
      }
    } else {
      feature.parameters = {};
    }

    // Populate parameters.through for hole candidates based on feature type.
    if (mappedType === 'through_hole_candidate') {
      feature.parameters.through = true;
    } else if (mappedType === 'blind_hole_candidate') {
      feature.parameters.through = false;
    }

    features.push(feature);
  }

  return features;
}

/**
 * Map feature type names to canonical query names (whitelist).
 * Only the 5 canonical types are valid; unknown types map to 'unknown'.
 */
function mapFeatureType(oldType: string): string {
  const canonical: Record<string, string> = {
    hole_candidate: 'hole_candidate',
    through_hole_candidate: 'through_hole_candidate',
    blind_hole_candidate: 'blind_hole_candidate',
    fillet_candidate: 'fillet_candidate',
    pocket_candidate: 'pocket_candidate',
  };
  return canonical[oldType] ?? 'unknown';
}

/**
 * Apply feature filters.
 */
function applyFeatureFilters(
  features: ExtractedFeatureEntity[],
  filter: QueryStepFeaturesInput['filter'],
  region: QueryStepFeaturesInput['region'],
  near: QueryStepFeaturesInput['near']
): ExtractedFeatureEntity[] {
  let result = features;

  if (filter) {
    if (filter.entity_ids && filter.entity_ids.length > 0) {
      const idSet = new Set(filter.entity_ids);
      result = result.filter((f) => idSet.has(f.id));
    }

    if (filter.confidence_min !== undefined) {
      result = result.filter((f) => f.confidence >= filter.confidence_min!);
    }

    // Geometric filters on parameters if available.
    if (filter.radius_min !== undefined || filter.radius_max !== undefined) {
      result = result.filter((f) => {
        if (!f.parameters || typeof f.parameters.radius !== 'number') return false;
        const radius = f.parameters.radius;
        if (filter.radius_min !== undefined && radius < filter.radius_min) return false;
        if (filter.radius_max !== undefined && radius > filter.radius_max) return false;
        return true;
      });
    }

    if (filter.diameter_min !== undefined || filter.diameter_max !== undefined) {
      result = result.filter((f) => {
        if (!f.parameters || typeof f.parameters.diameter !== 'number') return false;
        const diameter = f.parameters.diameter;
        if (filter.diameter_min !== undefined && diameter < filter.diameter_min) return false;
        if (filter.diameter_max !== undefined && diameter > filter.diameter_max) return false;
        return true;
      });
    }

    if (filter.depth_min !== undefined || filter.depth_max !== undefined) {
      result = result.filter((f) => {
        if (!f.parameters || typeof f.parameters.depth !== 'number') return false;
        const depth = f.parameters.depth;
        if (filter.depth_min !== undefined && depth < filter.depth_min) return false;
        if (filter.depth_max !== undefined && depth > filter.depth_max) return false;
        return true;
      });
    }

    if (filter.through !== undefined) {
      result = result.filter((f) => f.parameters?.through === filter.through);
    }
  }

  if (region && result.length > 0) {
    const mode = region.mode ?? 'intersects';
    result = result.filter((f) => {
      if (!f.bbox || !f.center) return false;
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

  if (near && result.length > 0) {
    result = result.filter((f) => {
      if (!f.center) return false;
      const dist = pointDistance(f.center, near.point);
      return dist <= near.distance;
    });
  }

  return result;
}

/**
 * Sort features by specified criteria.
 */
function sortFeatures(
  features: ExtractedFeatureEntity[],
  sort: NonNullable<QueryStepFeaturesInput['sort']>
): ExtractedFeatureEntity[] {
  const sorted = [...features];
  const direction = sort.direction === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.by) {
      case 'confidence':
        cmp = a.confidence - b.confidence;
        break;
      case 'radius':
        cmp =
          ((a.parameters?.radius as number | undefined) ?? 0) -
          ((b.parameters?.radius as number | undefined) ?? 0);
        break;
      case 'diameter':
        cmp =
          ((a.parameters?.diameter as number | undefined) ?? 0) -
          ((b.parameters?.diameter as number | undefined) ?? 0);
        break;
      case 'depth':
        cmp =
          ((a.parameters?.depth as number | undefined) ?? 0) -
          ((b.parameters?.depth as number | undefined) ?? 0);
        break;
      case 'center_x':
        cmp = (a.center?.[0] ?? 0) - (b.center?.[0] ?? 0);
        break;
      case 'center_y':
        cmp = (a.center?.[1] ?? 0) - (b.center?.[1] ?? 0);
        break;
      case 'center_z':
        cmp = (a.center?.[2] ?? 0) - (b.center?.[2] ?? 0);
        break;
    }
    return cmp * direction;
  });

  return sorted;
}

/**
 * Project a feature to only the requested include fields.
 */
function projectFeature(
  feature: ExtractedFeatureEntity,
  include: QueryStepFeaturesInput['include']
): Record<string, unknown> {
  const fields = include ?? ['id', 'feature_type', 'confidence'];
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field) {
      case 'id':
        result.id = feature.id;
        break;
      case 'feature_type':
        result.feature_type = feature.feature_type;
        break;
      case 'parameters':
        if (feature.parameters !== undefined) result.parameters = feature.parameters;
        break;
      case 'bbox':
        if (feature.bbox !== undefined) result.bbox = feature.bbox;
        break;
      case 'center':
        if (feature.center !== undefined) result.center = feature.center;
        break;
      case 'axis':
        // Placeholder: feature axis if available (e.g., hole axis).
        if (feature.parameters?.axis !== undefined) result.axis = feature.parameters.axis;
        break;
      case 'source_faces':
        if (feature.source_faces !== undefined) result.source_faces = feature.source_faces;
        break;
      case 'confidence':
        result.confidence = feature.confidence;
        break;
    }
  }

  return result;
}

/**
 * Aggregate feature types.
 */
function aggregateFeatureTypes(features: ExtractedFeatureEntity[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const f of features) {
    agg[f.feature_type] = (agg[f.feature_type] ?? 0) + 1;
  }
  return agg;
}

/**
 * Get confidence range.
 */
function getConfidenceRange(
  features: ExtractedFeatureEntity[]
): { min: number; max: number } | null {
  if (features.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const f of features) {
    if (f.confidence < min) min = f.confidence;
    if (f.confidence > max) max = f.confidence;
  }
  return { min, max };
}
