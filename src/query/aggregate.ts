/**
 * Aggregate dispatch.
 *
 * Computes statistics over a collection of entities (or any array of records).
 * Each spec has the form "<op>:<field>" or just "count".
 *
 * Supported ops:
 *   - count:   number of items (field is optional)
 *   - min:     minimum value of the field
 *   - max:     maximum value of the field
 *   - avg:     mean value of the field
 *   - stddev:  sample standard deviation of the field
 *   - sum:     sum of the field
 *
 * Special spec "count" (no field) returns the count of items in the collection.
 * Special spec "count:hit_distance" (after a ray_test) returns the number of
 * hits across all entities.
 *
 * Aggregation runs over the per-entity measure results; the LLM does not
 * have to recompute stats client-side. This is the documented "server-side
 * aggregation" pattern that keeps token count low.
 */

export type AggregateOp = 'count' | 'min' | 'max' | 'avg' | 'stddev' | 'sum';

export interface AggregateResult {
  spec: string;
  op: AggregateOp;
  field: string | undefined;
  value: number;
}

const AGGREGATE_REGEX = /^(count|min|max|avg|stddev|sum)(?::([a-z_][a-z0-9_]*))?$/i;

export function parseAggregateSpec(spec: string): { op: AggregateOp; field: string | undefined } {
  const m = AGGREGATE_REGEX.exec(spec);
  if (!m) {
    throw new Error(`invalid aggregate spec "${spec}"`);
  }
  return { op: m[1].toLowerCase() as AggregateOp, field: m[2] };
}

/**
 * Compute a list of aggregate statistics over a collection of records.
 *
 * Records may be plain entities (with field names like "area", "length")
 * or records augmented with measure results (with field names like
 * "ray_test", "distance", "hit_distance"). The dispatch walks each record
 * and pulls out the requested field.
 */
export function dispatchAggregate(
  records: ReadonlyArray<Record<string, unknown>>,
  specs: ReadonlyArray<string>,
): AggregateResult[] {
  const out: AggregateResult[] = [];
  for (const spec of specs) {
    const { op, field } = parseAggregateSpec(spec);
    if (op === 'count' && !field) {
      out.push({ spec, op, field: undefined, value: records.length });
      continue;
    }
    if (!field) {
      out.push({ spec, op, field: undefined, value: 0 });
      continue;
    }
    const values = extractFieldValues(records, field);
    out.push({ spec, op, field, value: computeOp(op, values) });
  }
  return out;
}

/**
 * Merge aggregate results into a flat statistics object keyed by spec.
 * This is the shape that lands in the response's `statistics` field.
 */
export function aggregateToStatistics(results: AggregateResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) {
    out[r.spec] = r.value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function extractFieldValues(
  records: ReadonlyArray<Record<string, unknown>>,
  field: string,
): number[] {
  const out: number[] = [];
  for (const r of records) {
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push(v);
    } else if (Array.isArray(v)) {
      /* For fields that are arrays (e.g. hit_distance from ray_test_grid),
       * expand into individual numeric values. */
      for (const item of v) {
        if (typeof item === 'number' && Number.isFinite(item)) out.push(item);
      }
    } else if (v && typeof v === 'object' && 'distance' in v) {
      /* For ray_test hits, the "distance" field is the relevant scalar. */
      const d = (v as { distance: unknown }).distance;
      if (typeof d === 'number' && Number.isFinite(d)) out.push(d);
    }
  }
  return out;
}

function computeOp(op: AggregateOp, values: number[]): number {
  if (values.length === 0) {
    return op === 'count' ? 0 : Number.NaN;
  }
  switch (op) {
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'stddev': {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length - 1);
      return Math.sqrt(variance);
    }
  }
}
