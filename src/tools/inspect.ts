import { z } from 'zod';
import { handleInspectStepFile } from '../domain/step-file.js';
import { runTool } from '../tool-helper.js';
import { filePath } from '../tool-schemas.js';

const includeSchema = z
  .array(z.enum(['size', 'counts', 'health', 'bodies', 'quality', 'pmi', 'inertia', 'topology']))
  .optional()
  .meta({
    description: 'Detail presets. Default: size, counts, health. Add more for detailed analysis.',
  });

export const schema = z
  .object({
    file_path: filePath,
    include: includeSchema,
  })
  .strict();

export const examples = [
  { file_path: 'model.step' },
  {
    file_path: 'model.step',
    include: ['size', 'counts', 'health', 'bodies', 'quality', 'topology'],
  },
];

const DEFAULT_INCLUDE = new Set(['size', 'counts', 'health']);

export async function handler(args: z.output<typeof schema>) {
  return runTool(async () => {
    const full = await handleInspectStepFile(args.file_path);
    const include = args.include ? new Set(args.include) : DEFAULT_INCLUDE;
    return filterInspectResult(full, include);
  });
}

function filterInspectResult(
  full: Record<string, unknown>,
  include: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { file_path: full.file_path };

  if (include.has('size')) result.size = full.size;
  if (include.has('counts') || include.has('health')) {
    result.structure = full.structure;
  }
  if (include.has('health')) {
    result.health = full.health;
  }
  if (include.has('bodies')) result.bodies = full.bodies;
  if (include.has('quality')) result.quality = full.quality;
  if (include.has('pmi')) result.pmi = full.pmi;
  if (include.has('inertia')) {
    result.principal_axes = full.principal_axes;
    result.inertia_matrix = full.inertia_matrix;
    result.bounding_box_obb = full.bounding_box_obb;
  }
  if (include.has('topology')) {
    result.topology_summary = full.topology_summary;
    result.geometry_extremes = full.geometry_extremes;
  }

  return result;
}
