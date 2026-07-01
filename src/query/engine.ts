/**
 * QueryEngine: the single internal entry point for declarative STEP queries.
 *
 * Routes queries for `faces` and `edges` entity types to their respective
 * services. Unsupported entity types throw an error.
 */

import { queryStepFaces as queryFacesService } from './faces.js';
import { queryStepEdges as queryEdgesService } from './edges.js';
import { withStepModel } from '../model-store.js';
import { dispatchMeasure, type MeasureSpec } from './measure.js';
import { dispatchAggregate, aggregateToStatistics } from './aggregate.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import { parseEntityId } from '../utils/ids.js';
import type {
  StepQueryResponse,
  StepQueryUnits,
  StepQueryCoordinateSystem,
  StepQueryPagination,
  StepQueryGroup,
} from '../tools/step-tools.js';

export type EntityType = 'faces' | 'edges';

export interface QueryInput {
  file_path: string;
  from: EntityType;
  entity_ids?: string[];
  where?: Record<string, unknown>;
  group_by?: string[];
  measure?: Array<Record<string, unknown>>;
  aggregate?: string[];
  select?: string[];
  order_by?: { by: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  return_type?: 'entities' | 'summary' | 'groups';
}

const SUPPORTED_ENTITIES: ReadonlySet<EntityType> = new Set(['faces', 'edges']);

/**
 * Top-level entry: execute a declarative query against a STEP file.
 */
export async function executeQuery(
  input: QueryInput,
): Promise<StepQueryResponse<Record<string, unknown>>> {
  if (!SUPPORTED_ENTITIES.has(input.from)) {
    throw {
      type: 'not_implemented',
      message: `query_step only supports from: "faces" and "edges". Got "${input.from}".`,
    };
  }

  validateEntityIdsMatchQuery(input.from, input.entity_ids);
  const warnings = buildIgnoredWhereWarnings(input.from, input.where);

  /* Step 1: filter / sort / paginate via the entity-specific service. */
  const base = await runEntityService(input);
  base.warnings = [...base.warnings, ...warnings];

  /* Step 2: optionally run measure ops per entity and attach the results. */
  if (input.measure?.length) {
    await applyMeasureToEntities(
      input.file_path,
      base.entities,
      input.measure as unknown as MeasureSpec[],
    );
  }

  /* Step 3: optionally compute aggregate statistics over the (now-augmented) entities. */
  if (input.aggregate?.length) {
    const agg = dispatchAggregate(base.entities, input.aggregate);
    const stats = aggregateToStatistics(agg);
    base.statistics = { ...base.statistics, ...stats };
  }

  return base;
}

/* ------------------------------------------------------------------ */
/*  Internal: entity service dispatch                                  */
/* ------------------------------------------------------------------ */

async function runEntityService(
  input: QueryInput,
): Promise<StepQueryResponse<Record<string, unknown>>> {
  if (input.from === 'faces') {
    return queryFacesService(input.file_path, input);
  }
  return queryEdgesService(input.file_path, input);
}

/* ------------------------------------------------------------------ */
/*  Internal: measure dispatch                                         */
/* ------------------------------------------------------------------ */

async function applyMeasureToEntities(
  filePath: string,
  entities: Array<Record<string, unknown>>,
  specs: MeasureSpec[],
): Promise<void> {
  if (entities.length === 0) return;
  await withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('query_step_measure');
    /* Determine the sub-shape type from the first entity ID. */
    const subType = entityTypeFromId(entities[0]?.id as string);
    if (!subType) return;
    const subShapes = kernel.getSubShapes(shape, subType);

    for (const entity of entities) {
      const idx = entityIndexFromId(entity.id as string);
      if (idx === undefined) continue;
      const handle = subShapes[idx];
      if (!handle) continue;
      const results = dispatchMeasure(kernel, shape, handle, specs);
      /* Attach the full measure result under the op name, AND flatten
       * commonly-aggregated scalar fields (e.g. ray_test_grid.hit_distance
       * -> entity.hit_distance) so aggregates can find them without
       * walking nested paths. */
      for (const [opName, value] of Object.entries(results)) {
        entity[opName] = value;
        flattenMeasureScalars(entity, opName, value);
      }
    }
  });
}

/**
 * Copy commonly-aggregated scalar fields from a measure result up to
 * the top level of the entity record. This makes aggregate specs like
 * `count:hit_distance` work without the LLM having to know about the
 * measure's nested structure.
 */
function flattenMeasureScalars(
  entity: Record<string, unknown>,
  opName: string,
  value: unknown,
): void {
  if (opName === 'ray_test_grid' && value && typeof value === 'object') {
    const grid = value as { hit_distance?: number[]; total_rays?: number };
    if (Array.isArray(grid.hit_distance)) entity.hit_distance = grid.hit_distance;
    if (typeof grid.total_rays === 'number') entity.total_rays = grid.total_rays;
  }
  if (opName === 'ray_test' && Array.isArray(value)) {
    /* ray_test returns an array of hits; the distances are commonly
     * aggregated. Flatten them as a top-level field. */
    const distances = value
      .map((h: { distance?: number }) => (typeof h?.distance === 'number' ? h.distance : undefined))
      .filter((d): d is number => typeof d === 'number');
    if (distances.length > 0) entity.hit_distance = distances;
  }
}

function entityTypeFromId(id: string | undefined): 'face' | 'edge' | null {
  const parsed = parseEntityId(id);
  return parsed?.type === 'face' || parsed?.type === 'edge' ? parsed.type : null;
}

function entityIndexFromId(id: string | undefined): number | undefined {
  return parseEntityId(id)?.index;
}

function validateEntityIdsMatchQuery(from: EntityType, entityIds: string[] | undefined): void {
  if (!entityIds?.length) return;

  const expectedType = from === 'faces' ? 'face' : 'edge';
  const mismatched = entityIds.find((id) => parseEntityId(id)?.type !== expectedType);
  if (!mismatched) return;

  throw {
    type: 'invalid_input',
    message: `entity_ids for from: "${from}" must use ${expectedType}:N IDs. Got "${mismatched}".`,
  };
}

function buildIgnoredWhereWarnings(
  from: EntityType,
  where: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  if (!where) return [];

  const allowedFields = from === 'faces' ? FACE_WHERE_FIELDS : EDGE_WHERE_FIELDS;
  return Object.keys(where)
    .filter((field) => !allowedFields.has(field))
    .map((field) => ({
      type: 'ignored_filter',
      field: `where.${field}`,
      message: `Ignored where.${field}; it does not apply to ${from}.`,
    }));
}

const SHARED_WHERE_FIELDS = new Set([
  'radius_min',
  'radius_max',
  'body_ids',
  'validity_status',
  'tolerance_max',
]);

const FACE_WHERE_FIELDS = new Set([
  ...SHARED_WHERE_FIELDS,
  'surface_type',
  'area_min',
  'area_max',
  'normal',
  'canonical_form',
]);

const EDGE_WHERE_FIELDS = new Set([
  ...SHARED_WHERE_FIELDS,
  'curve_type',
  'length_min',
  'length_max',
  'curvature_min',
  'curvature_max',
  'has_curve3d',
]);

/* ------------------------------------------------------------------ */
/*  Type re-exports (for consumers)                                    */
/* ------------------------------------------------------------------ */

export type {
  StepQueryResponse,
  StepQueryUnits,
  StepQueryCoordinateSystem,
  StepQueryPagination,
  StepQueryGroup,
};
export { CAD_RESPONSE_SCHEMA_VERSION };
