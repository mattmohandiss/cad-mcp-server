import { z } from 'zod';
import { compareStepFiles } from '../domain/compare.js';
import { runTool } from '../tool-helper.js';

export const schema = z
  .object({
    baseline_file_path: z.string().min(1).meta({
      description: 'Path to baseline STEP file.',
    }),
    comparison_file_path: z.string().min(1).meta({
      description: 'Path to comparison STEP file.',
    }),
  })
  .strict();

export const examples = [
  { baseline_file_path: 'model_v1.step', comparison_file_path: 'model_v2.step' },
];

export async function handler(args: z.output<typeof schema>) {
  return runTool(() => compareStepFiles(args.baseline_file_path, args.comparison_file_path));
}
