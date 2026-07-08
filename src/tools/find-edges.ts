import { z } from 'zod';
import { queryStepEdges } from '../query/edges.js';
import { runTool } from '../tool-helper.js';
import { CURVE_TYPES } from '../tool-defs.js';
import { filePath, bodyId } from '../tool-schemas.js';

const includeSchema = z.enum(['basic', 'bounds', 'geometry', 'adjacency', 'topology', 'quality']);
const summarizeBySchema = z.enum(['type', 'body', 'length_range', 'radius_range', 'feature']);
const summarizeStatsSchema = z.enum(['count', 'length', 'radius', 'diameter']);
const summarizeUniqueSchema = z.enum(['radius', 'diameter']);
type UniqueField = z.output<typeof summarizeUniqueSchema>;
type StatField = z.output<typeof summarizeStatsSchema>;

export const schema = z
  .object({
    file_path: filePath,
    filters: z
      .object({
        type: z.enum(CURVE_TYPES).optional().meta({ description: 'Edge curve type.' }),
        body_ids: z.array(bodyId).min(1).optional(),
        length: z
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
        dihedral_angle: z
          .object({
            min_degrees: z.number().min(0).max(180).optional(),
            max_degrees: z.number().min(0).max(180).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    include: z.array(includeSchema).min(1).optional(),
    summarize: z
      .object({
        by: z.array(summarizeBySchema).min(1).max(3).optional(),
        stats: z.array(summarizeStatsSchema).min(1).optional(),
        unique: z.array(summarizeUniqueSchema).min(1).optional(),
      })
      .strict()
      .optional(),
    sort: z
      .enum(['longest', 'shortest', 'largest_radius', 'smallest_radius', 'sharpest'])
      .optional(),
    max_results: z.number().int().min(1).max(1000).default(100).optional(),
  })
  .strict();

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    filters: { type: 'circle' },
    include: ['basic', 'geometry', 'bounds'],
    sort: 'smallest_radius',
  },
  {
    file_path: 'model.step',
    filters: { type: 'line', length: { min: 50 } },
    include: ['basic', 'geometry'],
    sort: 'longest',
  },
  {
    file_path: 'model.step',
    filters: { dihedral_angle: { min_degrees: 30 } },
    summarize: { stats: ['count'], by: ['length_range'] },
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    const query = toQuery(args);
    return queryStepEdges(args.file_path, query);
  });
}

function toQuery(args: Args) {
  const where: Record<string, unknown> = {};
  const filters = args.filters;
  if (filters?.type !== undefined) where.curve_type = filters.type;
  if (filters?.length?.min !== undefined) where.length_min = filters.length.min;
  if (filters?.length?.max !== undefined) where.length_max = filters.length.max;
  if (filters?.radius?.min !== undefined) where.radius_min = filters.radius.min;
  if (filters?.radius?.max !== undefined) where.radius_max = filters.radius.max;
  if (filters?.body_ids !== undefined) where.body_ids = filters.body_ids;
  if (filters?.dihedral_angle?.min_degrees !== undefined) {
    where.dihedral_min_deg = filters.dihedral_angle.min_degrees;
  }

  const summarize = args.summarize;
  const includeEntities = args.include !== undefined;
  return {
    where: Object.keys(where).length > 0 ? where : undefined,
    select: selectFields(args.include, summarize?.unique),
    group_by: summarize?.by?.filter((field) => field !== 'feature').map(mapGroupBy),
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
    if (preset === 'basic') add(fields, ['id', 'curve_type', 'length', 'body_id']);
    if (preset === 'bounds') add(fields, ['bbox', 'bbox_center']);
    if (preset === 'geometry') add(fields, ['radius', 'diameter', 'start_point', 'end_point']);
    if (preset === 'adjacency') add(fields, ['adjacent_faces', 'dihedral_angle_deg', 'convexity']);
    if (preset === 'topology') add(fields, ['start_vertex', 'end_vertex', 'continuity']);
    if (preset === 'quality') add(fields, ['is_closed', 'is_periodic']);
  }
  if (Array.isArray(unique)) add(fields, unique);
  return fields.size > 0 ? [...fields] : undefined;
}

function add(set: Set<string>, values: string[]): void {
  for (const value of values) set.add(value);
}

function mapGroupBy(value: z.output<typeof summarizeBySchema>): string {
  if (value === 'type') return 'curve_type';
  if (value === 'body') return 'body_id';
  return value;
}

function aggregateSpecs(stats: StatField[] | undefined): string[] | undefined {
  if (!Array.isArray(stats)) return undefined;
  const specs = new Set<string>();
  for (const stat of stats) {
    if (stat === 'count') specs.add('count');
    if (stat === 'length') add(specs, ['min:length', 'max:length', 'avg:length']);
    if (stat === 'radius') add(specs, ['min:radius', 'max:radius', 'avg:radius']);
    if (stat === 'diameter') add(specs, ['min:diameter', 'max:diameter', 'avg:diameter']);
  }
  return [...specs];
}

function mapSort(sort: Args['sort']) {
  if (sort === 'longest') return { by: 'length' as const, direction: 'desc' as const };
  if (sort === 'shortest') return { by: 'length' as const, direction: 'asc' as const };
  if (sort === 'largest_radius') return { by: 'radius' as const, direction: 'desc' as const };
  if (sort === 'smallest_radius') return { by: 'radius' as const, direction: 'asc' as const };
  if (sort === 'sharpest') return { by: 'diameter' as const, direction: 'desc' as const };
  return undefined;
}
