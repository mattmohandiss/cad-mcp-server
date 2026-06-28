/**
 * QueryEngine: the single internal entry point for declarative STEP queries.
 *
 * Replaces the 9-tool surface's per-tool query services with a unified dispatcher.
 * The four new tools (inspect_step, query_step, diff_step, transact_step) all
 * route through this engine.
 *
 * For now, queries on the `faces` and `edges` entity types are fully
 * supported via the existing services in src/query/. Other entity types
 * (bodies, vertices, pmi, color, layer, material, assembly_node) are
 * stubbed to throw "not yet implemented" — they'll be filled in as the
 * Tier A kernel methods ship.
 */

import { queryStepFaces as queryFacesService } from './faces.js';
import { queryStepEdges as queryEdgesService } from './edges.js';
import { withStepModel } from '../model-store.js';
import { dispatchMeasure, type MeasureSpec } from './measure.js';
import { dispatchAggregate, aggregateToStatistics } from './aggregate.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import type {
  StepQueryResponse,
  StepQueryUnits,
  StepQueryCoordinateSystem,
  StepQueryPagination,
  StepQueryGroup,
} from '../tools/step-tools.js';

export type EntityType =
  | 'faces'
  | 'edges'
  | 'bodies'
  | 'vertices'
  | 'pmi'
  | 'color'
  | 'layer'
  | 'material'
  | 'assembly_node';

export interface QueryInput {
  file_path: string;
  entities: EntityType;
  entity_ids?: string[];
  filter?: Record<string, unknown>;
  group_by?: string[];
  measure?: Array<Record<string, unknown>>;
  aggregate?: string[];
  select?: string[];
  sort?: { by: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  return_type?: 'entities' | 'summary' | 'groups';
}

const SUPPORTED_ENTITIES: ReadonlySet<EntityType> = new Set(['faces', 'edges']);

/**
 * Top-level entry: execute a declarative query against a STEP file.
 *
 * Routing:
 *   - `faces` -> queryStepFaces service
 *   - `edges` -> queryStepEdges service
 *   - others -> throw with a clear migration message
 */
export async function executeQuery(input: QueryInput): Promise<StepQueryResponse<Record<string, unknown>>> {
  if (!SUPPORTED_ENTITIES.has(input.entities)) {
    throw {
      type: 'not_implemented',
      message:
        `query_step for entities="${input.entities}" is not yet implemented in the 4-tool surface. ` +
        'It will arrive in a subsequent release as Tier A kernel methods and XDE ship.',
    };
  }

  /* Step 1: filter / sort / paginate via the entity-specific service. */
  const base = await runEntityService(input);

  /* Step 2: optionally run measure ops per entity and attach the results. */
  if (input.measure?.length) {
    await applyMeasureToEntities(input.file_path, base.entities, input.measure as unknown as MeasureSpec[]);
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

async function runEntityService(input: QueryInput): Promise<StepQueryResponse<Record<string, unknown>>> {
  if (input.entities === 'faces') {
    return queryFacesService(input.file_path, {
      ...(input.entity_ids !== undefined ? { entity_ids: input.entity_ids } : {}),
      ...(input.select !== undefined ? { fields: input.select } : {}),
      ...(input.group_by !== undefined ? { group_by: input.group_by as never } : {}),
      ...(input.sort !== undefined ? { sort: input.sort as never } : {}),
      return_type: input.return_type,
      limit: input.limit,
      offset: input.offset,
      ...stripEntitySpecificFilters(input.filter),
    } as never);
  }
  return queryEdgesService(input.file_path, {
    ...(input.entity_ids !== undefined ? { entity_ids: input.entity_ids } : {}),
    ...(input.select !== undefined ? { fields: input.select } : {}),
    ...(input.group_by !== undefined ? { group_by: input.group_by as never } : {}),
    ...(input.sort !== undefined ? { sort: input.sort as never } : {}),
    return_type: input.return_type,
    limit: input.limit,
    offset: input.offset,
    ...stripEntitySpecificFilters(input.filter),
  } as never);
}

function stripEntitySpecificFilters(filter?: Record<string, unknown>): Record<string, unknown> {
  if (!filter) return {};
  /* For the legacy face/edge services, rename `surface_type` -> `surface_types`
   * (the legacy services expect arrays) and `curve_type` -> `curve_types`.
   * Other fields pass through; the legacy services ignore what they don't
   * recognize. */
  const out: Record<string, unknown> = { ...filter };
  if (typeof out.surface_type === 'string') {
    out.surface_types = [out.surface_type];
    delete out.surface_type;
  }
  if (typeof out.curve_type === 'string') {
    out.curve_types = [out.curve_type];
    delete out.curve_type;
  }
  return out;
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
  if (!id) return null;
  if (id.startsWith('face:')) return 'face';
  if (id.startsWith('edge:')) return 'edge';
  return null;
}

function entityIndexFromId(id: string | undefined): number | undefined {
  if (!id) return undefined;
  const m = /^(?:face|edge):(\d+)$/.exec(id);
  if (!m) return undefined;
  return Number(m[1]);
}

/* ------------------------------------------------------------------ */
/*  Type re-exports (for consumers)                                    */
/* ------------------------------------------------------------------ */

export type { StepQueryResponse, StepQueryUnits, StepQueryCoordinateSystem, StepQueryPagination, StepQueryGroup };
export { CAD_RESPONSE_SCHEMA_VERSION };
