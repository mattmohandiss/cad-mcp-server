import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { AagInput, AagModel, AagProvider } from '../aag.js';
import type { FeatureCandidate } from '../schema.js';
import { makeFeatureId, makeId } from '../../utils/ids.js';
import { withImportedStep } from './import.js';
import type { AagRawGraph, AagAdjacency } from './aag-utils.js';
import { buildAagFromShape } from './aag-utils.js';

const AAG_LIMITATIONS = [
  'Face adjacency and vexity are computed from the B-rep topology, not from the original design intent (feature tree).',
  'Vexity computation uses dihedral angle heuristics with a +/-0.05 cosine threshold for convex/concave/smooth classification.',
  'Feature recognition is pattern-based on the AAG and may miss non-standard or compound features.',
];

export class OcctWasmAagProvider implements AagProvider {
  readonly name = 'occt-wasm-aag';
  readonly capabilities = ['face_adjacency', 'vexity', 'feature_recognition'] as const;

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

        const features = recognizeAagFeatures(raw, kernel, shape);

        return {
          provider: {
            name: this.name,
            capabilities: [...this.capabilities],
            limitations: AAG_LIMITATIONS,
          },
          available: true,
          nodes,
          edges,
          features,
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

function recognizeAagFeatures(
  raw: AagRawGraph,
  kernel: OcctKernel,
  shape: ShapeHandle
): FeatureCandidate[] {
  const features: FeatureCandidate[] = [];
  const faceShapes = kernel.getSubShapes(shape, 'face');

  const adjacencyByFace = new Map<number, AagAdjacency[]>();
  for (const adj of raw.adjacencies) {
    addToMap(adjacencyByFace, adj.faceAIndex, adj);
    addToMap(adjacencyByFace, adj.faceBIndex, adj);
  }

  let featureIndex = 0;

  for (let i = 0; i < raw.faces.length; i++) {
    const face = raw.faces[i];
    if (face.surfaceType !== 'cylinder') continue;

    const faceAdj = adjacencyByFace.get(i) ?? [];
    const nonCylindricalAdj = faceAdj.filter(
      (adj) =>
        raw.faces[adj.faceAIndex === i ? adj.faceBIndex : adj.faceAIndex].surfaceType !== 'cylinder'
    );

    if (nonCylindricalAdj.length === 0) continue;

    const concaveCount = nonCylindricalAdj.filter((adj) => adj.vexity === 'concave').length;
    const convexCount = nonCylindricalAdj.filter((adj) => adj.vexity === 'convex').length;

    if (convexCount > concaveCount) {
      const planarEndCaps = nonCylindricalAdj.filter(
        (adj) =>
          raw.faces[adj.faceAIndex === i ? adj.faceBIndex : adj.faceAIndex].surfaceType === 'plane'
      );

      const cylinderData = kernel.getFaceCylinderData(faceShapes[i]);
      const radius = cylinderData?.radius;

      const evidence = {
        confidence: planarEndCaps.length >= 2 ? 0.75 : 0.6,
        sourceIds: [makeId('aag:face', i)],
        provider: 'occt-wasm-aag',
        method: 'derived' as const,
        explanation: [
          `Cylindrical face (index ${i}) detected with ${convexCount} convex adjacencies and ${planarEndCaps.length} planar end cap(s).`,
          ...(radius !== undefined ? [`Radius: ${Math.round(radius * 1000) / 1000} mm`] : []),
        ],
        limitations: [
          'Detected from AAG convexity pattern, not from the design feature tree.',
          'Cannot distinguish between a designed hole and a machined hole without process metadata.',
        ],
      };

      features.push({
        id: makeFeatureId('hole_candidate', featureIndex++),
        type: planarEndCaps.length >= 2 ? 'through_hole_candidate' : 'blind_hole_candidate',
        sourceIds: [makeId('body', 0), makeId('aag:face', i)],
        ...(radius !== undefined ? { dimensions: { radius } } : {}),
        evidence,
      });
    }
  }

  for (const adj of raw.adjacencies) {
    if (adj.vexity !== 'smooth') continue;

    const faceA = raw.faces[adj.faceAIndex];
    const faceB = raw.faces[adj.faceBIndex];

    const hasCylindrical = faceA.surfaceType === 'cylinder' || faceB.surfaceType === 'cylinder';

    if (!hasCylindrical) continue;

    const curveTypes = adj.sharedCurveTypes;
    const hasCircularEdge = curveTypes.includes('circle');

    features.push({
      id: makeFeatureId('fillet_candidate', featureIndex++),
      type: 'fillet_candidate',
      sourceIds: [makeId('aag:face', adj.faceAIndex), makeId('aag:face', adj.faceBIndex)],
      evidence: {
        confidence: hasCircularEdge ? 0.7 : 0.55,
        sourceIds: [makeId('aag:adj', raw.adjacencies.indexOf(adj))],
        provider: 'occt-wasm-aag',
        method: 'derived',
        explanation: [
          `Smooth (G1-continuous) adjacency detected between faces ${adj.faceAIndex} (${faceA.surfaceType}) and ${adj.faceBIndex} (${faceB.surfaceType}).`,
          ...(hasCircularEdge
            ? ['Shared edge is circular, consistent with constant-radius fillet.']
            : []),
        ],
        limitations: [
          'Cannot distinguish fillets from other smooth transitions without design-tree context.',
        ],
      },
    });
  }

  for (let i = 0; i < raw.faces.length; i++) {
    const face = raw.faces[i];
    if (face.surfaceType !== 'plane') continue;
    if (face.hasInnerWires) continue;

    const faceAdj = adjacencyByFace.get(i) ?? [];
    if (faceAdj.length === 0) continue;

    const allConcave = faceAdj.every((adj) => adj.vexity === 'concave');

    if (allConcave) {
      const wallIndices = faceAdj.map((adj) =>
        adj.faceAIndex === i ? adj.faceBIndex : adj.faceAIndex
      );

      features.push({
        id: makeFeatureId('pocket_candidate', featureIndex++),
        type: 'pocket_candidate',
        sourceIds: [makeId('aag:face', i), ...wallIndices.map((wi) => makeId('aag:face', wi))],
        evidence: {
          confidence: 0.65,
          sourceIds: [makeId('aag:face', i)],
          provider: 'occt-wasm-aag',
          method: 'derived',
          explanation: [
            `Planar face (index ${i}) has all ${faceAdj.length} adjacent edges with concave vexity, consistent with a pocket floor.`,
          ],
          limitations: [
            'Cannot distinguish pockets from slots, grooves, or depressions without geometric profile analysis.',
          ],
        },
      });
    }
  }

  return features;
}

function unavailableModel(name: string, capabilities: readonly string[]): AagModel {
  return {
    provider: { name, capabilities: [...capabilities], limitations: [] },
    available: false,
    nodes: [],
    edges: [],
    features: [],
    limitations: [
      {
        source: name,
        message:
          'STEP import failed. AAG face adjacency and feature recognition are unavailable for this file.',
      },
    ],
    provenance: [{ provider: name, method: 'derived' }],
  };
}

function addToMap<T>(map: Map<number, T[]>, key: number, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}
