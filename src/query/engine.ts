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

  /* The faces / edges services already implement filter / sort / pagination
   * and return the queryOutputSchema envelope. We post-process to add
   * `measure` results and `aggregate` values on top. */

  const base = input.entities === 'faces'
    ? await queryFacesService(input.file_path, {
        entity_ids: input.entity_ids,
        fields: input.select,
        group_by: input.group_by as never,
        sort: input.sort as never,
        return_type: input.return_type,
        limit: input.limit,
        offset: input.offset,
        ...stripEntitySpecificFilters(input.filter),
      } as never)
    : await queryEdgesService(input.file_path, {
        entity_ids: input.entity_ids,
        fields: input.select,
        group_by: input.group_by as never,
        sort: input.sort as never,
        return_type: input.return_type,
        limit: input.limit,
        offset: input.offset,
        ...stripEntitySpecificFilters(input.filter),
      } as never);

  /* Compute measure / aggregate if requested.
   * Note: measure and aggregate are not yet fully wired through the engine;
   * this stub returns the base response with placeholders so the surface
   * is end-to-end testable. A subsequent commit will implement the
   * measure / aggregate dispatch. */
  return applyMeasurePlaceholder(base, input);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

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

function applyMeasurePlaceholder(
  base: StepQueryResponse<Record<string, unknown>>,
  input: QueryInput,
): StepQueryResponse<Record<string, unknown>> {
  if (!input.measure?.length && !input.aggregate?.length) {
    return base;
  }
  /* The full measure/aggregate dispatch is implemented in src/query/ops/measure.ts
   * and src/query/ops/aggregate.ts. For this initial cut we surface a clear
   * `limitations` entry so callers know the feature is staged. */
  return {
    ...base,
    limitations: [
      ...base.limitations,
      {
        source: 'query_step',
        message: 'measure and aggregate dispatch is staged; the response returns the base query without per-entity measurements. Full implementation lands in the next release alongside the Tier A kernel methods.',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Type re-exports (for consumers)                                    */
/* ------------------------------------------------------------------ */

export type { StepQueryResponse, StepQueryUnits, StepQueryCoordinateSystem, StepQueryPagination, StepQueryGroup };
export { CAD_RESPONSE_SCHEMA_VERSION };
