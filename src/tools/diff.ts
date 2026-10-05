import { z } from 'zod';
import { runTool } from '../tool-helper.js';
import { sidecarModels } from '../sidecar/models.js';
import { filePath } from '../tool-schemas.js';
import { parseStepMetadata } from '../pmi/metadata.js';
import { compareStepMetadata } from '../domain/compare.js';

export const schema = z
  .object({
    file_path_a: filePath.meta({
      description: 'Path to the first (baseline/original) STEP file. Example: "v1_bracket.step".',
    }),
    file_path_b: filePath.meta({
      description: 'Path to the second (modified/new) STEP file. Example: "v2_bracket.step".',
    }),
  })
  .strict();

export const examples = [{ file_path_a: 'model_v1.step', file_path_b: 'model_v2.step' }];

export async function handler(args: z.output<typeof schema>) {
  return runTool(async () => {
    type Stats = {
      solids: number;
      faces: number;
      edges: number;
      volume: number;
      surfaceArea: number;
      bounds: { min: number[]; max: number[] };
    };
    const read = (filePath: string) =>
      sidecarModels.withModel(filePath, async (client, modelId) => {
        const response = await client.request<Stats>('inspect', { modelId });
        return response.result;
      });
    const a = await read(args.file_path_a);
    const b = await read(args.file_path_b);
    const semanticA = await parseStepMetadata(args.file_path_a);
    const semanticB = await parseStepMetadata(args.file_path_b);
    const dims = (s: Stats) => s.bounds.min.map((min, i) => s.bounds.max[i]! - min);
    const da = dims(a);
    const db = dims(b);
    return {
      files: { a: args.file_path_a, b: args.file_path_b },
      deltas: {
        dimensions: { width: db[0]! - da[0]!, height: db[1]! - da[1]!, depth: db[2]! - da[2]! },
        volume: b.volume - a.volume,
        surfaceArea: b.surfaceArea - a.surfaceArea,
        bodyCount: b.solids - a.solids,
        faceCount: b.faces - a.faces,
        edgeCount: b.edges - a.edges,
      },
      exchange: compareStepMetadata(semanticA, semanticB),
      providers: {
        a: ['occt-sidecar', 'lightweight-step'],
        b: ['occt-sidecar', 'lightweight-step'],
      },
    };
  });
}
