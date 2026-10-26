import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
  measurementUnits,
} from '../domain/artifact-reference.js';
import { parseStepMetadata } from '../pmi/metadata.js';
import { comparePmi, compareStepMetadata } from '../domain/compare.js';
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
    volume: number | null;
    surfaceArea: number;
    bounds: { min: number[]; max: number[] };
  };
  const read = (uri: string) =>
    sidecarModels.withModel(
      artifactPath(uri),
      async (client, modelId, filePath, revision, units) => {
        const response = await client.request('inspect', { modelId });
        const pmi = await client.request('pmi', { modelId });
        return {
          stats: response.result,
          pmi: pmi.result,
          artifact: artifactReference(filePath, revision, units.name),
          filePath,
          sourceUnit: units,
        };
      },
    );
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
  // Each sidecar model is in its own declared unit. Convert the candidate into
  // the baseline unit so every delta has one unambiguous unit.
  const scale = candidate.sourceUnit.mmPerUnit / baseline.sourceUnit.mmPerUnit;
  const dims = (stats: Stats) => stats.bounds.min.map((min, i) => stats.bounds.max[i]! - min);
  const baselineDimensions = dims(baseline.stats);
  const candidateDimensions = dims(candidate.stats).map((value) => value * scale);
  const bothHaveVolume = baseline.stats.volume !== null && candidate.stats.volume !== null;
  return {
    inputs: [
      { role: 'baseline', artifact: baseline.artifact },
      { role: 'candidate', artifact: candidate.artifact },
    ],
    units: measurementUnits(baseline.sourceUnit),
    unit_note:
      `Deltas are in ${baseline.sourceUnit.name}.` +
      (candidate.sourceUnit.name === baseline.sourceUnit.name
        ? ''
        : ` The candidate declares ${candidate.sourceUnit.name} and was converted to ${baseline.sourceUnit.name}.`),
    deltas: {
      dimensions: {
        width: candidateDimensions[0]! - baselineDimensions[0]!,
        height: candidateDimensions[1]! - baselineDimensions[1]!,
        depth: candidateDimensions[2]! - baselineDimensions[2]!,
      },
      volume: bothHaveVolume
        ? (candidate.stats.volume as number) * scale ** 3 - (baseline.stats.volume as number)
        : null,
      volume_available: bothHaveVolume,
      surfaceArea: candidate.stats.surfaceArea * scale ** 2 - baseline.stats.surfaceArea,
      bodyCount: candidate.stats.solids - baseline.stats.solids,
      faceCount: candidate.stats.faces - baseline.stats.faces,
      edgeCount: candidate.stats.edges - baseline.stats.edges,
    },
    exchange: compareStepMetadata(semanticBaseline, semanticCandidate),
    pmi: comparePmi(baseline.pmi, candidate.pmi),
    providers: {
      baseline: ['occt-sidecar', 'lightweight-step'],
      candidate: ['occt-sidecar', 'lightweight-step'],
    },
  };
}
