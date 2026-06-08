import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { FeatureCandidate } from '../schema.js';
import { makeFeatureId } from '../../utils/ids.js';

interface FeatureCounts {
  circularEdges: number;
  cylindricalFaces: number;
}

export function detectFeatureHints(
  kernel: OcctKernel,
  shape: ShapeHandle,
  sourceIds: string[] = ['brep:shape']
): FeatureCandidate[] {
  const counts = countFeatureIndicators(kernel, shape);
  const features: FeatureCandidate[] = [];

  if (counts.cylindricalFaces > 0 || counts.circularEdges >= 2) {
    features.push({
      id: makeFeatureId('hole_candidate', features.length),
      type: 'hole_candidate',
      sourceIds,
      evidence: {
        confidence: counts.cylindricalFaces > 0 ? 0.65 : 0.45,
        sourceIds,
        provider: 'occt-wasm',
        method: 'heuristic',
        explanation: [
          `${counts.cylindricalFaces} cylindrical face(s) detected`,
          `${counts.circularEdges} circular edge(s) detected`,
        ],
        limitations: [
          'This is a B-rep heuristic, not preserved feature-tree intent.',
          'True AAG/vexity analysis is unavailable until an AAG provider is configured.',
        ],
      },
    });
  }

  if (counts.cylindricalFaces > 0 && counts.circularEdges > 0) {
    features.push({
      id: makeFeatureId('fillet_candidate', features.length),
      type: 'fillet_candidate',
      sourceIds,
      evidence: {
        confidence: 0.4,
        sourceIds,
        provider: 'occt-wasm',
        method: 'heuristic',
        explanation: ['Cylindrical faces and circular edges are present.'],
        limitations: [
          'Cannot distinguish holes from fillets reliably without AAG/vexity evidence.',
        ],
      },
    });
  }

  return features;
}

function countFeatureIndicators(kernel: OcctKernel, shape: ShapeHandle): FeatureCounts {
  const faces = kernel.getSubShapes(shape, 'face');
  const edges = kernel.getSubShapes(shape, 'edge');
  let circularEdges = 0;
  let cylindricalFaces = 0;

  for (const edge of edges) {
    if (kernel.curveType(edge) === 'circle') circularEdges++;
  }

  for (const face of faces) {
    if (kernel.surfaceType(face) === 'cylinder') cylindricalFaces++;
  }

  return { circularEdges, cylindricalFaces };
}
