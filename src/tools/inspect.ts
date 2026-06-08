import { analyzeStepFile } from '../cad/analyze.js';
import { inspectProjection } from '../cad/projections.js';
import { wrapTool } from './shared.js';

export async function handleInspectStepFile(filePath: string) {
  return wrapTool(async () => inspectProjection(await analyzeStepFile(filePath)));
}
