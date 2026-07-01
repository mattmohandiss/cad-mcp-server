/**
 * query_edges — find, filter, and aggregate edges on a STEP model.
 *
 * Thin adapter: validates the input, maps external fields to the internal
 * engine shape, and dispatches to the edge query service.
 */

import { z } from 'zod';
import { queryEdgesSchema } from '../schemas/tool-schemas.js';
import { queryStepEdges } from '../query/edges.js';
import { wrapTool } from './shared.js';

export const queryEdgesInput = queryEdgesSchema;
export type QueryEdgesArgs = z.infer<typeof queryEdgesSchema>;

export async function handleQueryEdges(args: QueryEdgesArgs) {
  return wrapTool(() => {
    const where: Record<string, unknown> = {};

    if (args.curve_type !== undefined) where.curve_type = args.curve_type;
    if (args.length_min !== undefined && args.length_min > 0) where.length_min = args.length_min;
    if (args.length_max !== undefined && args.length_max > 0) where.length_max = args.length_max;
    if (args.radius_min !== undefined && args.radius_min > 0) where.radius_min = args.radius_min;
    if (args.radius_max !== undefined && args.radius_max > 0) where.radius_max = args.radius_max;
    if (args.body_ids !== undefined && args.body_ids.length > 0) where.body_ids = args.body_ids;

    return queryStepEdges(args.file_path, {
      where: Object.keys(where).length > 0 ? where : undefined,
      select: args.select,
      group_by: args.group_by as string[] | undefined,
      order_by: args.order_by,
      return_type: args.return_type,
      limit: args.limit,
      offset: args.offset,
    });
  });
}
