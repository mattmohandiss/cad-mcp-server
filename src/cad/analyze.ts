import { LightweightStepSemanticProvider } from '../providers/lightweight-step/semantic-provider.js';
import { OcctWasmAagProvider } from '../providers/occt-wasm/aag-provider.js';
import { OcctWasmBRepProvider } from '../providers/occt-wasm/brep-provider.js';
import type { AnalysisOptions, CadKnowledgeGraph } from './schema.js';
import { buildCadKnowledgeGraph } from './graph-builder.js';

const brepProvider = new OcctWasmBRepProvider();
const aagProvider = new OcctWasmAagProvider();
const semanticProvider = new LightweightStepSemanticProvider();

export async function analyzeStepFile(
  filePath: string,
  options: AnalysisOptions = {}
): Promise<CadKnowledgeGraph> {
  void options;
  const [brep, aag, semantic] = await Promise.all([
    brepProvider.load(filePath),
    aagProvider.build({ filePath }),
    semanticProvider.extract(filePath),
  ]);

  return buildCadKnowledgeGraph({ filePath, brep, aag, semantic });
}
