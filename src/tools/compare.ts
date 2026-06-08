import { compareStepFiles } from '../cad/compare.js';
import { wrapTool } from './shared.js';

export async function handleCompareStepFiles(fileA: string, fileB: string) {
  return wrapTool(async () => compareStepFiles(fileA, fileB));
}
