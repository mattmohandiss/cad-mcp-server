import { analyzeStepFile } from '../cad/analyze.js';
import { queryGraph, type GraphQuery } from '../cad/graph-query.js';
import { providerSummary } from '../cad/projections.js';
import { wrapTool } from './shared.js';

export async function handleQueryStepGraph(filePath: string, query: GraphQuery) {
  return wrapTool(async () => {
    const graph = await analyzeStepFile(filePath);
    return {
      filePath,
      query,
      ...queryGraph(graph, query),
      providers: providerSummary(graph),
    };
  });
}
