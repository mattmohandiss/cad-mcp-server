/**
 * query_faces — find, filter, and aggregate faces on a STEP model.
 *
 * Thin adapter: validates the input, maps external fields to the internal
 * engine shape, and dispatches to the face query service.
 */

import { z } from 'zod';
import { queryFacesSchema } from '../schemas/tool-schemas.js';
import { queryStepFaces } from '../query/faces.js';
import { wrapTool } from './shared.js';

export const queryFacesInput = queryFacesSchema;
export type QueryFacesArgs = z.infer<typeof queryFacesSchema>;

export async function handleQueryFaces(args: QueryFacesArgs) {
  return wrapTool(() => {
    const where: Record<string, unknown> = {};

    if (args.surface_type !== undefined) where.surface_type = args.surface_type;
    if (args.area_min !== undefined && args.area_min > 0) where.area_min = args.area_min;
    if (args.area_max !== undefined && args.area_max > 0) where.area_max = args.area_max;
    if (args.radius_min !== undefined && args.radius_min > 0) where.radius_min = args.radius_min;
    if (args.radius_max !== undefined && args.radius_max > 0) where.radius_max = args.radius_max;
    if (args.body_ids !== undefined && args.body_ids.length > 0) where.body_ids = args.body_ids;

    return queryStepFaces(args.file_path, {
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
