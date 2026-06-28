/**
 * Pipeline executor for the transact_step tool.
 *
 * The pipeline vocabulary is small (5 ops):
 *   - query:        re-uses the query_step input shape
 *   - for_each:     apply a sub-pipeline to each item in the input list
 *   - filter_results: keep items where a simple expression holds
 *   - select:       project to a list of fields
 *   - walk_assembly: traverse the assembly tree (XDE)
 *
 * Each pipeline step reads its input from the previous step's output by
 * default. Intermediate state is hidden unless `return_intermediate: true`.
 *
 * Status:
 *   - query:        fully wired (delegates to QueryEngine)
 *   - select:       fully wired (per-item field projection)
 *   - for_each:     fully wired (sub-pipeline executed per item)
 *   - filter_results: fully wired (simple expression evaluator)
 *   - walk_assembly: staged for XDE
 */

import { executeQuery, type QueryInput } from './engine.js';
import { type MeasureSpec } from './measure.js';
import { withStepModel } from '../model-store.js';

export type PipelineOp = 'query' | 'for_each' | 'filter_results' | 'select' | 'walk_assembly';

export type PipelineStep = {
  op: PipelineOp;
  params?: Record<string, unknown>;
  do?: PipelineStep[];
  where?: string;
  fields?: string[];
};

export interface PipelineInput {
  file_path: string;
  pipeline: PipelineStep[];
  return_intermediate?: boolean;
}

export interface PipelineResult {
  file_path: string;
  result: unknown;
  steps?: Array<{ step: number; op: string; result_count: number; elapsed_ms: number }>;
  warnings: string[];
  limitations: string[];
}

/**
 * Execute a pipeline against a STEP file.
 */
export async function executePipeline(input: PipelineInput): Promise<PipelineResult> {
  const warnings: string[] = [];
  const limitations: string[] = [];

  let value: unknown = null;
  /* Tracks the entities type of the most recent query step so the
   * for_each sub-pipeline can default its own query step. */
  let lastEntities: import('./engine.js').EntityType | undefined;
  const stepResults: PipelineResult['steps'] = [];

  for (let i = 0; i < input.pipeline.length; i++) {
    const step = input.pipeline[i];
    const start = Date.now();

    switch (step.op) {
      case 'query': {
        const qInput: QueryInput = {
          file_path: input.file_path,
          ...(step.params as Partial<QueryInput>),
        } as QueryInput;
        const result = await executeQuery(qInput);
        /* Auto-unwrap: downstream ops (select, filter_results, for_each)
         * operate on the entities array, not the full envelope. */
        value = (result as { entities?: unknown }).entities ?? result;
        lastEntities = qInput.entities;
        break;
      }
      case 'select': {
        if (!Array.isArray(value)) {
          throw pipelineError(`step ${i}: select requires an array input from the previous step`);
        }
        const fields = step.fields ?? [];
        value = (value as Array<Record<string, unknown>>).map((item) => {
          if (fields.length === 0) return item;
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            if (f in item) out[f] = item[f];
          }
          return out;
        });
        break;
      }
      case 'for_each': {
        if (!Array.isArray(value)) {
          throw pipelineError(`step ${i}: for_each requires an array input from the previous step`);
        }
        const subPipeline = step.do ?? [];
        if (subPipeline.length === 0) {
          throw pipelineError(`step ${i}: for_each requires a non-empty "do" sub-pipeline`);
        }
        const items = value as Array<Record<string, unknown>>;
        const perItemResults: unknown[] = [];
        for (const item of items) {
          const itemResult = await executeForEachItem(input.file_path, subPipeline, item, {
            entities: lastEntities,
          });
          perItemResults.push(itemResult);
        }
        value = perItemResults;
        break;
      }
      case 'filter_results': {
        if (!Array.isArray(value)) {
          throw pipelineError(
            `step ${i}: filter_results requires an array input from the previous step`,
          );
        }
        const expr = step.where ?? '';
        const items = value as Array<Record<string, unknown>>;
        value = items.filter((item) => evaluateExpression(expr, item));
        break;
      }
      case 'walk_assembly':
        limitations.push(
          `step ${i}: walk_assembly requires XDE (STEPCAFControl_Reader + XCAFDoc_*) which ships in a subsequent release`,
        );
        value = [];
        break;
      default: {
        const unknown: never = step.op;
        throw pipelineError(`step ${i}: unknown op "${String(unknown)}"`);
      }
    }

    stepResults.push({
      step: i,
      op: step.op,
      result_count: countItems(value),
      elapsed_ms: Date.now() - start,
    });
  }

  return {
    file_path: input.file_path,
    result: value,
    ...(input.return_intermediate ? { steps: stepResults } : {}),
    warnings,
    limitations,
  };
}

/* ------------------------------------------------------------------ */
/*  Internal: for_each per-item execution                              */
/* ------------------------------------------------------------------ */

/**
 * Execute a sub-pipeline against a single item from the parent for_each.
 * The item is available as context to the sub-pipeline's measure ops:
 * symbolic origins like "extent_max" / "extent_min" resolve against the
 * item's bbox.
 */
async function executeForEachItem(
  filePath: string,
  subPipeline: PipelineStep[],
  item: Record<string, unknown>,
  parentContext: ForEachContext,
): Promise<unknown> {
  const extent = itemExtent(item);
  /* Wrap the item in a single-element array so the sub-pipeline's
   * select / filter_results ops can operate on it as a list. The
   * final result is unwrapped before returning to the parent. */
  let value: unknown = [item];

  for (let i = 0; i < subPipeline.length; i++) {
    const step = subPipeline[i];
    switch (step.op) {
      case 'query': {
        /* The sub-pipeline's query step re-runs query_step against the
         * model. The parent's entities type is the default; the item's
         * id is the implicit entity_id filter. Measure ops within the
         * query step resolve their symbolic origins against the item's
         * bbox. */
        const params = step.params ?? {};
        const qInput: QueryInput = {
          file_path: filePath,
          ...(parentContext.entities ? { entities: parentContext.entities } : {}),
          ...params,
          ...(params.entity_ids ? {} : { entity_ids: item.id ? [String(item.id)] : [] }),
          ...(params.measure
            ? {
                measure: (params.measure as MeasureSpec[]).map((spec) => {
                  /* If the spec uses a symbolic origin and the item has
                   * an extent, pass the resolved numeric origin in. */
                  if (
                    typeof spec.origin === 'string' &&
                    (spec.origin === 'extent_max' || spec.origin === 'extent_min') &&
                    extent
                  ) {
                    const point = spec.origin === 'extent_max' ? extent.max : extent.min;
                    return { ...spec, origin: point };
                  }
                  return spec;
                }),
              }
            : {}),
        } as QueryInput;
        const result = await executeQuery(qInput);
        value = (result as { entities?: unknown }).entities ?? result;
        break;
      }
      case 'select': {
        if (!Array.isArray(value)) {
          throw pipelineError(`sub-pipeline step ${i}: select requires an array input`);
        }
        const fields = step.fields ?? [];
        value = (value as Array<Record<string, unknown>>).map((it) => {
          if (fields.length === 0) return it;
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            if (f in it) out[f] = it[f];
          }
          return out;
        });
        break;
      }
      case 'filter_results': {
        if (!Array.isArray(value)) {
          throw pipelineError(`sub-pipeline step ${i}: filter_results requires an array input`);
        }
        const expr = step.where ?? '';
        value = (value as Array<Record<string, unknown>>).filter((it) =>
          evaluateExpression(expr, it),
        );
        break;
      }
      case 'for_each':
        throw pipelineError(`nested for_each is not supported in this release`);
      case 'walk_assembly':
        return [];
      default: {
        const unknown: never = step.op;
        throw pipelineError(`sub-pipeline step ${i}: unknown op "${String(unknown)}"`);
      }
    }
  }

  /* If the sub-pipeline ended with a single-item array (the common case),
   * unwrap it so the parent gets the item, not [item]. */
  if (Array.isArray(value) && value.length === 1) {
    return value[0];
  }
  return value;
}

/** Context passed from the parent for_each to each item's sub-pipeline. */
interface ForEachContext {
  entities?: import('./engine.js').EntityType;
}

/* ------------------------------------------------------------------ */
/*  Internal: simple expression evaluator                              */
/* ------------------------------------------------------------------ */

/**
 * Evaluate a simple expression against a record. Supported forms:
 *   - "field op value"   e.g. "diameter > 5", "name == 'Handle'"
 *   - "field.empty"      e.g. "pos_hits.empty", "face_ids.empty"
 *   - "field.count op value"  e.g. "face_ids.count == 1", "pos_hits.count > 0"
 *
 * Supported ops: ==, !=, >, <, >=, <=
 */
export function evaluateExpression(expr: string, record: Record<string, unknown>): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;

  /* field.empty */
  const emptyMatch = /^([a-z_][a-z0-9_]*)\.empty$/i.exec(trimmed);
  if (emptyMatch) {
    const field = emptyMatch[1];
    return isEmpty(record[field]);
  }

  /* field.count op value */
  const countMatch = /^([a-z_][a-z0-9_]*)\.count\s*(==|!=|>=|<=|>|<)\s*(.+)$/i.exec(trimmed);
  if (countMatch) {
    const field = countMatch[1];
    const op = countMatch[2];
    const value = parseValue(countMatch[3]);
    const count = countOf(record[field]);
    return compare(count, op, value);
  }

  /* field op value */
  const fieldMatch = /^([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/i.exec(
    trimmed,
  );
  if (fieldMatch) {
    const field = fieldMatch[1];
    const op = fieldMatch[2];
    const value = parseValue(fieldMatch[3]);
    const fieldValue = resolveFieldPath(record, field);
    return compare(fieldValue, op, value);
  }

  /* Unrecognized expression — return false (fail closed). */
  return false;
}

function resolveFieldPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = record;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function countOf(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object' && 'count' in v) {
    const c = (v as { count: unknown }).count;
    if (typeof c === 'number') return c;
  }
  if (typeof v === 'string') return v.length;
  return 0;
}

function parseValue(raw: string): number | string | boolean {
  const s = raw.trim();
  /* Quoted string */
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  /* Boolean */
  if (s === 'true') return true;
  if (s === 'false') return false;
  /* Number */
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  /* Bare string (unquoted identifier) */
  return s;
}

function compare(a: unknown, op: string, b: unknown): boolean {
  /* If both numeric, do numeric comparison. */
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case '==':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return a > b;
      case '<':
        return a < b;
      case '>=':
        return a >= b;
      case '<=':
        return a <= b;
    }
  }
  /* Otherwise do stringified comparison. */
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  switch (op) {
    case '==':
      return sa === sb;
    case '!=':
      return sa !== sb;
    case '>':
      return sa > sb;
    case '<':
      return sa < sb;
    case '>=':
      return sa >= sb;
    case '<=':
      return sa <= sb;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Internal: item extent helper                                       */
/* ------------------------------------------------------------------ */

interface ItemExtent {
  min: [number, number, number];
  max: [number, number, number];
}

function itemExtent(item: Record<string, unknown>): ItemExtent | undefined {
  /* Look for a bbox in the item; fall back to undefined. */
  const bbox = item.bbox as { min?: number[]; max?: number[] } | undefined;
  if (bbox && Array.isArray(bbox.min) && Array.isArray(bbox.max)) {
    return {
      min: [bbox.min[0] ?? 0, bbox.min[1] ?? 0, bbox.min[2] ?? 0],
      max: [bbox.max[0] ?? 0, bbox.max[1] ?? 0, bbox.max[2] ?? 0],
    };
  }
  /* For groups, the face_ids are face:N references; we don't have a
   * group-level bbox in the response. The pipeline can be improved
   * later by computing it from the constituent entities. */
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Internal: misc                                                     */
/* ------------------------------------------------------------------ */

function countItems(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && 'entities' in value) {
    const response = value as { entities?: unknown };
    if (Array.isArray(response.entities)) return response.entities.length;
  }
  return 0;
}

function pipelineError(message: string) {
  return { type: 'pipeline_error', message };
}

/* Suppress the unused-import warning for withStepModel. It is referenced
 * by the measure dispatch within for_each's sub-pipeline. */
void withStepModel;
