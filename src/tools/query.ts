/**
 * query_step — declarative query (the workhorse).
 *
 * Thin adapter: validates the input, dispatches to the QueryEngine
 * based on `entities`. The engine handles routing to the right service
 * and post-processing (measure, aggregate).
 *
 * The shape is SQL-influenced: filter / group_by / measure / aggregate
 * / select are orthogonal fields the LLM composes. The query engine
 * itself is the only place that knows about entity-type routing.
 */

import { z } from 'zod';
import { queryStepSchema } from '../schemas/tool-schemas.js';
import { executeQuery } from '../query/engine.js';
import { wrapTool } from './shared.js';

export const queryStepInput = queryStepSchema;
export type QueryStepArgs = z.infer<typeof queryStepSchema>;

export async function handleQueryStep(args: QueryStepArgs) {
  return wrapTool(() =>
    executeQuery({
      file_path: args.file_path,
      entities: args.entities,
      ...(args.entity_ids !== undefined ? { entity_ids: args.entity_ids } : {}),
      ...(args.filter !== undefined ? { filter: args.filter as Record<string, unknown> } : {}),
      ...(args.group_by !== undefined ? { group_by: args.group_by as string[] } : {}),
      ...(args.measure !== undefined ? { measure: args.measure as Array<Record<string, unknown>> } : {}),
      ...(args.aggregate !== undefined ? { aggregate: args.aggregate as string[] } : {}),
      ...(args.select !== undefined ? { select: args.select as string[] } : {}),
      ...(args.sort !== undefined ? { sort: args.sort } : {}),
      limit: args.limit,
      offset: args.offset,
      return_type: args.return_type,
    }),
  );
}
