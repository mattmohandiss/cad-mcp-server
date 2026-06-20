import type { AagInput, AagModel, AagProvider } from '../aag.js';
import { makeId } from '../../utils/ids.js';
import { withImportedStep } from './import.js';
import { buildAagFromShape } from './aag-utils.js';

const AAG_LIMITATIONS = [
  'Face adjacency is computed from the B-rep topology, not from the original design intent (feature tree).',
];

export class OcctWasmAagProvider implements AagProvider {
  readonly name = 'occt-wasm-aag';
  readonly capabilities = ['face_adjacency'] as const;

  async build(input: AagInput): Promise<AagModel> {
    try {
      return await withImportedStep(input.filePath, 'AAG build', (kernel, shape) => {
        const raw = buildAagFromShape(kernel, shape);

        const nodes = raw.faces.map((face, i) => ({
          id: makeId('aag:face', i),
          faceId: makeId('face', i),
          attributes: {
            index: face.index,
            surfaceType: face.surfaceType,
            area: Math.round(face.area * 1000) / 1000,
            hasInnerWires: face.hasInnerWires,
            centerOfMass: `${Math.round(face.centerOfMass.x * 100) / 100},${Math.round(face.centerOfMass.y * 100) / 100},${Math.round(face.centerOfMass.z * 100) / 100}`,
          },
        }));

        const edges = raw.adjacencies.map((adj, i) => ({
          id: makeId('aag:adj', i),
          from: makeId('aag:face', adj.faceAIndex),
          to: makeId('aag:face', adj.faceBIndex),
          attributes: {
            sharedEdgeIds: [],
            vexity: adj.vexity,
            dihedralAngleDeg: Math.round(adj.dihedralAngleDeg * 10) / 10,
            sharedCurveTypes: adj.sharedCurveTypes,
          },
        }));

        return {
          provider: {
            name: this.name,
            capabilities: [...this.capabilities],
            limitations: AAG_LIMITATIONS,
          },
          available: true,
          nodes,
          edges,
          limitations: AAG_LIMITATIONS.map((message) => ({
            source: this.name,
            message,
          })),
          provenance: [
            {
              provider: this.name,
              sourceId: 'brep:aag',
              method: 'measured',
            },
          ],
        };
      });
    } catch {
      return unavailableModel(this.name, this.capabilities);
    }
  }
}

function unavailableModel(name: string, capabilities: readonly string[]): AagModel {
  return {
    provider: { name, capabilities: [...capabilities], limitations: [] },
    available: false,
    nodes: [],
    edges: [],
    limitations: [
      {
        source: name,
        message: 'STEP import failed. AAG face adjacency is unavailable for this file.',
      },
    ],
    provenance: [{ provider: name, method: 'derived' }],
  };
}
