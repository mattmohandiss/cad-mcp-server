import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
} from '../domain/artifact-reference.js';
import { parseStepMetadata } from '../pmi/metadata.js';
import { compareStepMetadata } from '../domain/compare.js';
import { fileRevision } from '../utils/hash.js';

const baseSchema = z
  .object({
    baseline: artifactLocatorSchema.describe('Original STEP artifact.'),
    candidate: artifactLocatorSchema.describe('Modified STEP artifact.'),
  })
  .strict();

export const schema = z.preprocess(stripNulls, baseSchema);

export const examples = [
  {
    baseline: { uri: 'file:///work/model_v1.step' },
    candidate: { uri: 'file:///work/model_v2.step' },
  },
];

export async function handler(args: z.output<typeof schema>) {
  type Stats = {
    solids: number;
    faces: number;
    edges: number;
    volume: number;
    surfaceArea: number;
    bounds: { min: number[]; max: number[] };
  };
  const read = (uri: string) =>
    sidecarModels.withModel(artifactPath(uri), async (client, modelId, filePath, revision) => {
      const response = await client.request('inspect', { modelId });
      return {
        stats: response.result,
        artifact: artifactReference(filePath, revision),
        filePath,
      };
    });
  const baseline = await read(args.baseline.uri);
  const candidate = await read(args.candidate.uri);
  const parseVerified = async (path: string, expectedRevision: string) => {
    if ((await fileRevision(path)) !== expectedRevision) {
      throw {
        type: 'stale_reference',
        message: 'STEP file changed before metadata comparison; retry diff against stable files.',
      };
    }
    const metadata = await parseStepMetadata(path);
    if ((await fileRevision(path)) !== expectedRevision) {
      throw {
        type: 'stale_reference',
        message: 'STEP file changed during metadata comparison; retry diff against stable files.',
      };
    }
    return metadata;
  };
  const [semanticBaseline, semanticCandidate] = await Promise.all([
    parseVerified(baseline.filePath, baseline.artifact.revision),
    parseVerified(candidate.filePath, candidate.artifact.revision),
  ]);
  const dims = (stats: Stats) => stats.bounds.min.map((min, i) => stats.bounds.max[i]! - min);
  const baselineDimensions = dims(baseline.stats);
  const candidateDimensions = dims(candidate.stats);
  return {
    inputs: [
      { role: 'baseline', artifact: baseline.artifact },
      { role: 'candidate', artifact: candidate.artifact },
    ],
    units: { length: 'mm', area: 'mm2', volume: 'mm3' },
    deltas: {
      dimensions: {
        width: candidateDimensions[0]! - baselineDimensions[0]!,
        height: candidateDimensions[1]! - baselineDimensions[1]!,
        depth: candidateDimensions[2]! - baselineDimensions[2]!,
      },
      volume: candidate.stats.volume - baseline.stats.volume,
      surfaceArea: candidate.stats.surfaceArea - baseline.stats.surfaceArea,
      bodyCount: candidate.stats.solids - baseline.stats.solids,
      faceCount: candidate.stats.faces - baseline.stats.faces,
      edgeCount: candidate.stats.edges - baseline.stats.edges,
    },
    exchange: compareStepMetadata(semanticBaseline, semanticCandidate),
    providers: {
      baseline: ['occt-sidecar', 'lightweight-step'],
      candidate: ['occt-sidecar', 'lightweight-step'],
    },
  };
}
