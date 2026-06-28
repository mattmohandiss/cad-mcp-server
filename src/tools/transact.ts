/**
 * transact_step — imperative pipeline (escape hatch).
 *
 * Thin adapter: validates the input, delegates to the PipelineExecutor.
 * Use this only when a single query_step call cannot express the workflow.
 *
 * Pipeline ops: query, for_each, filter_results, select, walk_assembly.
 * `query` and `select` are fully wired in this initial cut; the other
 * ops parse and validate but defer execution to subsequent releases.
 */

import { z } from 'zod';
import { transactStepSchema } from '../schemas/tool-schemas.js';
import { executePipeline } from '../query/pipeline.js';
import { wrapTool } from './shared.js';

export const transactStepInput = transactStepSchema;
export type TransactStepArgs = z.infer<typeof transactStepSchema>;

export async function handleTransactStep(args: TransactStepArgs) {
  return wrapTool(() =>
    executePipeline({
      file_path: args.file_path,
      pipeline: args.pipeline as never,
      return_intermediate: args.return_intermediate,
    }),
  );
}
