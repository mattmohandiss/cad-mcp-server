import { z } from 'zod';
import { queryStepFaces } from '../query/faces.js';
import { runTool } from '../tool-helper.js';
import { SURFACE_TYPES } from '../tool-defs.js';
import { filePath, bodyId } from '../tool-schemas.js';

const point3Schema = z.array(z.number()).length(3);

const includeSchema = z.enum(['basic', 'bounds', 'geometry', 'adjacency', 'topology', 'quality']);
const summarizeBySchema = z.enum([
  'type',
  'body',
  'axis',
  'normal_direction',
  'area_range',
  'radius_range',
]);
const summarizeStatsSchema = z.enum(['count', 'area', 'radius', 'diameter']);
const summarizeUniqueSchema = z.enum(['radius', 'diameter']);
type UniqueField = z.output<typeof summarizeUniqueSchema>;
type StatField = z.output<typeof summarizeStatsSchema>;

export const schema = z
  .object({
    file_path: filePath,
    filters: z
      .object({
        type: z.enum(SURFACE_TYPES).optional().meta({ description: 'Face surface type.' }),
        body_ids: z.array(bodyId).min(1).optional().meta({
          description: 'Restrict to specific bodies from inspect_step.',
        }),
        area: z
          .object({
            min: z.number().nonnegative().optional(),
            max: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
        radius: z
          .object({
            min: z.number().nonnegative().optional(),
            max: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
        normal: z
          .object({
            direction: point3Schema,
            match: z.enum(['same_direction', 'opposite_direction', 'parallel']).default('parallel'),
            tolerance_degrees: z.number().min(0).max(180).default(10).optional(),
          })
          .strict()
          .optional()
          .meta({ description: 'Filter faces by normal direction.' }),
        quality: z
          .object({
            valid: z.boolean().optional(),
            tolerance_max: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    include: z.array(includeSchema).min(1).optional().meta({
      description:
        'Result detail presets. Omit for basic face identity, area, bounds, and adjacency.',
    }),
    summarize: z
      .object({
        by: z.array(summarizeBySchema).min(1).max(3).optional(),
        stats: z.array(summarizeStatsSchema).min(1).optional(),
        unique: z.array(summarizeUniqueSchema).min(1).optional(),
      })
      .strict()
      .optional(),
    sort: z.enum(['largest_area', 'smallest_area', 'largest_radius', 'smallest_radius']).optional(),
    max_results: z.number().int().min(1).max(1000).default(100).optional(),
  })
  .strict();

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    filters: { type: 'cylinder' },
    include: ['basic', 'geometry'],
    sort: 'smallest_radius',
  },
  {
    file_path: 'model.step',
    filters: { type: 'cylinder' },
    summarize: { unique: ['diameter'], stats: ['count', 'diameter'] },
  },
  {
    file_path: 'model.step',
    filters: { type: 'plane' },
    summarize: { by: ['type'], stats: ['count', 'area'] },
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    const query = toQuery(args);
    return queryStepFaces(args.file_path, query);
  });
}

function toQuery(args: Args) {
  const where: Record<string, unknown> = {};
  const filters = args.filters;
  if (filters?.type !== undefined) where.surface_type = filters.type;
  if (filters?.area?.min !== undefined) where.area_min = filters.area.min;
  if (filters?.area?.max !== undefined) where.area_max = filters.area.max;
  if (filters?.radius?.min !== undefined) where.radius_min = filters.radius.min;
  if (filters?.radius?.max !== undefined) where.radius_max = filters.radius.max;
  if (filters?.body_ids !== undefined) where.body_ids = filters.body_ids;
  if (filters?.quality?.valid !== undefined) {
    where.validity_status = filters.quality.valid ? 'valid' : 'invalid';
  }
  if (filters?.quality?.tolerance_max !== undefined)
    where.tolerance_max = filters.quality.tolerance_max;
  if (filters?.normal !== undefined) {
    where.normal = {
      parallel_to:
        filters.normal.match === 'opposite_direction'
          ? filters.normal.direction.map((n) => -n)
          : filters.normal.direction,
      tolerance_degrees: filters.normal.tolerance_degrees,
    };
  }

  const summarize = args.summarize;
  const includeEntities = args.include !== undefined;
  return {
    where: Object.keys(where).length > 0 ? where : undefined,
    select: selectFields(args.include, summarize?.unique),
    group_by: summarize?.by?.map(mapGroupBy),
    aggregate: aggregateSpecs(summarize?.stats),
    unique: summarize?.unique,
    order_by: mapSort(args.sort),
    return_type:
      summarize?.by && !includeEntities
        ? 'groups'
        : summarize && !includeEntities
          ? 'summary'
          : 'entities',
    limit: args.max_results ?? 100,
    offset: 0,
  } as const;
}

function selectFields(
  include: Args['include'],
  unique: UniqueField[] | undefined,
): string[] | undefined {
  const fields = new Set<string>();
  const presets = include ?? ['basic', 'bounds'];
  for (const preset of presets) {
    if (preset === 'basic') add(fields, ['id', 'surface_type', 'area', 'body_id']);
    if (preset === 'bounds') add(fields, ['bbox', 'bbox_center']);
    if (preset === 'geometry')
      add(fields, ['normal', 'radius', 'diameter', 'axis', 'extent_along_axis']);
    if (preset === 'adjacency') add(fields, ['adjacent_faces', 'closest_face_distance']);
    if (preset === 'topology')
      add(fields, ['has_inner_wires', 'outer_edges', 'inner_wires', 'uv_bounds']);
    if (preset === 'quality') add(fields, ['is_valid', 'tolerance']);
  }
  if (Array.isArray(unique)) add(fields, unique);
  return fields.size > 0 ? [...fields] : undefined;
}

function add(set: Set<string>, values: string[]): void {
  for (const value of values) set.add(value);
}

function mapGroupBy(value: z.output<typeof summarizeBySchema>): string {
  if (value === 'type') return 'surface_type';
  if (value === 'body') return 'body_id';
  return value;
}

function aggregateSpecs(stats: StatField[] | undefined): string[] | undefined {
  if (!Array.isArray(stats)) return undefined;
  const specs = new Set<string>();
  for (const stat of stats) {
    if (stat === 'count') specs.add('count');
    if (stat === 'area') add(specs, ['min:area', 'max:area', 'avg:area']);
    if (stat === 'radius') add(specs, ['min:radius', 'max:radius', 'avg:radius']);
    if (stat === 'diameter') add(specs, ['min:diameter', 'max:diameter', 'avg:diameter']);
  }
  return [...specs];
}

function mapSort(sort: Args['sort']) {
  if (sort === 'largest_area') return { by: 'area' as const, direction: 'desc' as const };
  if (sort === 'smallest_area') return { by: 'area' as const, direction: 'asc' as const };
  if (sort === 'largest_radius') return { by: 'radius' as const, direction: 'desc' as const };
  if (sort === 'smallest_radius') return { by: 'radius' as const, direction: 'asc' as const };
  return undefined;
}
