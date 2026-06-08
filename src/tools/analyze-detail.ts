import { analyzeStepFile } from '../cad/analyze.js';
import { detailProjection } from '../cad/projections.js';
import type { DetailLevel, KnowledgeCategory } from '../cad/schema.js';
import { wrapTool } from './shared.js';

const DEFAULT_CATEGORIES: KnowledgeCategory[] = [
  'geometry',
  'topology',
  'structure',
  'features',
  'spatial',
  'exchange',
  'health',
];

export async function handleAnalyzeStepDetail(
  filePath: string,
  categories: KnowledgeCategory[] = DEFAULT_CATEGORIES,
  detailLevel: DetailLevel = 'summary'
) {
  return wrapTool(async () => {
    const graph = await analyzeStepFile(filePath, { categories, detailLevel });
    return detailProjection(graph, categories, detailLevel);
  });
}
