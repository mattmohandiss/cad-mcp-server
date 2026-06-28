/**
 * diff_step — two-file comparison.
 *
 * Thin adapter: validates the input, delegates to the existing
 * `compareStepFiles` service. The output is metric deltas plus
 * (in the next release) PMI / color / material deltas.
 */

import { z } from 'zod';
import { diffStepSchema } from '../schemas/tool-schemas.js';
import { compareStepFiles } from '../compare.js';
import { wrapTool } from './shared.js';

export const diffStepInput = diffStepSchema;
export type DiffStepArgs = z.infer<typeof diffStepSchema>;

export async function handleDiffStep(args: DiffStepArgs) {
  return wrapTool(() => compareStepFiles(args.baseline_file_path, args.comparison_file_path));
}
