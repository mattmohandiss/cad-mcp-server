/**
 * Pipeline executor for the transact_step tool.
 *
 * The pipeline vocabulary is small (5 ops):
 *   - query:        re-uses the query_step input shape
 *   - for_each:     apply a sub-pipeline to each item in the input list
 *   - filter_results: keep items where a simple expression holds
 *   - select:       project to a list of fields
 *   - walk_assembly: traverse the assembly tree (XDE)
 *
 * Each pipeline step reads its input from the previous step's output by
 * default. Intermediate state is hidden unless `return_intermediate: true`.
 */

import { executeQuery, type QueryInput } from './engine.js';

export type PipelineStep = {
  op: 'query' | 'for_each' | 'filter_results' | 'select' | 'walk_assembly';
  params?: Record<string, unknown>;
  do?: PipelineStep[];
  where?: string;
  fields?: string[];
};

export interface PipelineInput {
  file_path: string;
  pipeline: PipelineStep[];
  return_intermediate?: boolean;
}

export interface PipelineResult {
  file_path: string;
  result: unknown;
  steps?: Array<{ step: number; op: string; result_count: number; elapsed_ms: number }>;
  warnings: string[];
  limitations: string[];
}

/**
 * Execute a pipeline against a STEP file.
 *
 * For now, the implementation handles `query` and `select` ops against
 * the existing QueryEngine. `for_each`, `filter_results`, and
 * `walk_assembly` are parsed and validated but their execution is
 * staged for subsequent releases as the Tier A kernel methods ship.
 */
export async function executePipeline(input: PipelineInput): Promise<PipelineResult> {
  const warnings: string[] = [];
  const limitations: string[] = [];

  let value: unknown = null;
  const stepResults: PipelineResult['steps'] = [];

  for (let i = 0; i < input.pipeline.length; i++) {
    const step = input.pipeline[i];
    const start = Date.now();

    switch (step.op) {
      case 'query': {
        const qInput: QueryInput = {
          file_path: input.file_path,
          ...(step.params as Partial<QueryInput>),
        } as QueryInput;
        const result = await executeQuery(qInput);
        /* Auto-unwrap: downstream ops (select, filter_results, for_each)
         * operate on the entities array, not the full envelope. The
         * caller can reach the envelope via the `query` step alone. */
        value = (result as { entities?: unknown }).entities ?? result;
        break;
      }
      case 'select': {
        if (!Array.isArray(value)) {
          throw pipelineError(`step ${i}: select requires an array input from the previous step`);
        }
        const fields = step.fields ?? [];
        value = (value as Array<Record<string, unknown>>).map((item) => {
          if (fields.length === 0) return item;
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            if (f in item) out[f] = item[f];
          }
          return out;
        });
        break;
      }
      case 'for_each':
        limitations.push(`step ${i}: for_each is staged for a subsequent release`);
        value = [];
        break;
      case 'filter_results':
        limitations.push(`step ${i}: filter_results is staged for a subsequent release`);
        break;
      case 'walk_assembly':
        limitations.push(
          `step ${i}: walk_assembly requires XDE (STEPCAFControl_Reader + XCAFDoc_*) which ships in a subsequent release`,
        );
        value = [];
        break;
      default: {
        const unknown: never = step.op;
        throw pipelineError(`step ${i}: unknown op "${String(unknown)}"`);
      }
    }

    stepResults.push({
      step: i,
      op: step.op,
      result_count: countItems(value),
      elapsed_ms: Date.now() - start,
    });
  }

  return {
    file_path: input.file_path,
    result: value,
    ...(input.return_intermediate ? { steps: stepResults } : {}),
    warnings,
    limitations,
  };
}

function countItems(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && 'entities' in value) {
    const response = value as { entities?: unknown };
    if (Array.isArray(response.entities)) return response.entities.length;
  }
  return 0;
}

function pipelineError(message: string) {
  return { type: 'pipeline_error', message };
}
