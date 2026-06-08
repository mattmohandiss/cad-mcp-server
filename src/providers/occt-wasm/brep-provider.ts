import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BRepBody, BRepModel, BRepProvider } from '../brep.js';
import { makeId } from '../../utils/ids.js';
import { detectFeatureHints } from './features.js';
import { withImportedStep } from './import.js';
import { getDimensions, guessShapeClass, toBoundingBox } from './measure.js';
import { getEdgeStatistics } from './topology.js';

export class OcctWasmBRepProvider implements BRepProvider {
  readonly name = 'occt-wasm';
  readonly capabilities = [
    'step_import',
    'body_metrics',
    'edge_statistics',
    'surface_types',
    'curve_types',
  ] as const;

  async load(filePath: string): Promise<BRepModel> {
    return withImportedStep(filePath, 'STEP import', (kernel, shape) => {
      const boundingBox = toBoundingBox(kernel, shape);
      const dimensions = getDimensions(boundingBox);
      const solids = kernel.getSubShapes(shape, 'solid');
      const faces = kernel.getSubShapes(shape, 'face');
      const bodies = this.getBodies(kernel, shape, solids.length ? solids : [shape]);
      const featureHints = detectFeatureHints(kernel, shape);

      return {
        provider: {
          name: this.name,
          capabilities: [...this.capabilities],
          limitations: [
            'Does not expose true AAG face adjacency/vexity in this provider path.',
            'Feature candidates are heuristic B-rep hints, not authoritative design intent.',
          ],
        },
        filePath,
        units: { length: 'mm', area: 'mm^2', volume: 'mm^3' },
        boundingBox,
        dimensions,
        volume: kernel.getVolume(shape),
        surfaceArea: kernel.getSurfaceArea(shape),
        bodyCount: bodies.length,
        shapeType: guessShapeClass(dimensions),
        faceCount: faces.length,
        edgeStatistics: getEdgeStatistics(kernel, shape),
        bodies,
        featureHints,
        health: {
          isValid: safeIsValid(kernel, shape),
          warnings: [],
        },
        provenance: [{ provider: this.name, sourceId: 'brep:shape', method: 'measured' }],
      };
    });
  }

  private getBodies(
    kernel: OcctKernel,
    rootShape: ShapeHandle,
    bodyShapes: ShapeHandle[]
  ): BRepBody[] {
    return bodyShapes.map((body, index) => {
      const id = makeId('body', index);
      const boundingBox = toBoundingBox(kernel, body);
      return {
        id,
        index,
        boundingBox,
        dimensions: getDimensions(boundingBox),
        volume: kernel.getVolume(body),
        surfaceArea: kernel.getSurfaceArea(body),
        featureHints: detectFeatureHints(kernel, body, [id]),
      };
    });
  }
}

function safeIsValid(kernel: OcctKernel, shape: ShapeHandle): boolean | undefined {
  try {
    return kernel.isValid(shape);
  } catch {
    return undefined;
  }
}
