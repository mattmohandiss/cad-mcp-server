/**
 * inspect_step — model-level summary.
 *
 * Thin adapter: validates the input, delegates to the existing
 * `handleInspectStepFile` service, returns the structured response.
 *
 * This is the first tool the LLM should call when given an unfamiliar
 * STEP file. The output is the "1 tool that does a lot" — it returns
 * bbox, validity, topology, global properties, AND (in the next release)
 * the XDE summary.
 */

import { z } from 'zod';
import { inspectStepSchema } from '../schemas/tool-schemas.js';
import { handleInspectStepFile } from './step-tools.js';
import { wrapTool } from './shared.js';

export const inspectStepInput = inspectStepSchema;
export type InspectStepArgs = z.infer<typeof inspectStepSchema>;

export async function handleInspectStep(args: InspectStepArgs) {
  return wrapTool(() => handleInspectStepFile(args.file_path));
}
