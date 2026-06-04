import { access, readFile } from 'node:fs/promises';
import { OcctError, OcctErrorCode, OcctKernel, type ShapeHandle } from 'occt-wasm';
import { AnalysisError, Body, EdgeAnalysis, GeometrySummary } from './schema.js';

let kernelPromise: Promise<OcctKernel> | undefined;

async function getKernel(): Promise<OcctKernel> {
  kernelPromise ??= OcctKernel.init();
  return kernelPromise;
}

async function readStepFile(filePath: string): Promise<string | AnalysisError> {
  try {
    await access(filePath);
    return await readFile(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: 'file_not_found',
      message: `File not found: ${filePath}. ${message}`,
    };
  }
}

function mapOcctError(error: unknown, action: string): AnalysisError {
  if (error instanceof OcctError) {
    return {
      type: error.code === OcctErrorCode.ImportExportFailed ? 'invalid_format' : 'unknown',
      message: `${action} failed: ${error.message}`,
    };
  }

  return {
    type: 'unknown',
    message: `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

function getDimensions(boundingBox: GeometrySummary['boundingBox']): GeometrySummary['dimensions'] {
  return {
    width: boundingBox.max.x - boundingBox.min.x,
    height: boundingBox.max.y - boundingBox.min.y,
    depth: boundingBox.max.z - boundingBox.min.z,
  };
}

function toBoundingBox(kernel: OcctKernel, shape: ShapeHandle): GeometrySummary['boundingBox'] {
  const bbox = kernel.getBoundingBox(shape, false);

  return {
    min: { x: bbox.xmin, y: bbox.ymin, z: bbox.zmin },
    max: { x: bbox.xmax, y: bbox.ymax, z: bbox.zmax },
  };
}

function guessShapeClass(dimensions: GeometrySummary['dimensions']): GeometrySummary['shapeType'] {
  const { width, height, depth } = dimensions;

  if (width > height * 2 || width > depth * 2) return 'box';
  if (Math.abs(height - depth) < Math.max(height, depth) * 0.2) return 'cylindrical';
  return 'complex';
}

async function importShape(
  filePath: string
): Promise<{ kernel: OcctKernel; shape: ShapeHandle } | AnalysisError> {
  const stepData = await readStepFile(filePath);
  if (typeof stepData !== 'string') return stepData;

  try {
    const kernel = await getKernel();
    return { kernel, shape: kernel.importStep(stepData) };
  } catch (error) {
    return mapOcctError(error, 'STEP import');
  }
}

function detectFeatures(kernel: OcctKernel, shape: ShapeHandle): Body['features'] {
  const faces = kernel.getSubShapes(shape, 'face');
  const edges = kernel.getSubShapes(shape, 'edge');
  const circularEdges = edges.filter((edge) => kernel.curveType(edge) === 'circle').length;
  const cylindricalFaces = faces.filter((face) => kernel.surfaceType(face) === 'cylinder').length;

  return {
    hasHoles: cylindricalFaces > 0 || circularEdges >= 2,
    hasFillets: cylindricalFaces > 0 && circularEdges > 0,
  };
}

export async function analyzeStepFile(filePath: string): Promise<GeometrySummary | AnalysisError> {
  const imported = await importShape(filePath);
  if ('type' in imported) return imported;

  try {
    const { kernel, shape } = imported;
    const boundingBox = toBoundingBox(kernel, shape);
    const dimensions = getDimensions(boundingBox);
    const solids = kernel.getSubShapes(shape, 'solid');

    return {
      units: 'mm',
      boundingBox,
      dimensions,
      volume: kernel.getVolume(shape),
      surfaceArea: kernel.getSurfaceArea(shape),
      bodyCount: solids.length || 1,
      shapeType: guessShapeClass(dimensions),
    };
  } catch (error) {
    return mapOcctError(error, 'Geometry analysis');
  }
}

export async function listBodies(filePath: string): Promise<Body[] | AnalysisError> {
  const imported = await importShape(filePath);
  if ('type' in imported) return imported;

  try {
    const { kernel, shape } = imported;
    const solids = kernel.getSubShapes(shape, 'solid');
    const bodies = solids.length ? solids : [shape];

    return bodies.map((body, index) => ({
      index,
      volume: kernel.getVolume(body),
      surfaceArea: kernel.getSurfaceArea(body),
      boundingBox: toBoundingBox(kernel, body),
      features: detectFeatures(kernel, body),
    }));
  } catch (error) {
    return mapOcctError(error, 'Body analysis');
  }
}

export async function extractEdges(filePath: string): Promise<EdgeAnalysis | AnalysisError> {
  const imported = await importShape(filePath);
  if ('type' in imported) return imported;

  try {
    const { kernel, shape } = imported;
    const edges = kernel.getSubShapes(shape, 'edge').map((edge, index) => {
      const curveType = kernel.curveType(edge);

      return {
        index,
        length: kernel.getLength(edge),
        type:
          curveType === 'line'
            ? ('straight' as const)
            : curveType === 'unknown'
              ? ('unknown' as const)
              : ('curve' as const),
      };
    });
    const lengths = edges.map((edge) => edge.length);
    const averageLength = lengths.length
      ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length
      : 0;
    const features = detectFeatures(kernel, shape);

    return {
      totalEdgeCount: edges.length,
      edges,
      statistics: {
        averageLength,
        minLength: lengths.length ? Math.min(...lengths) : 0,
        maxLength: lengths.length ? Math.max(...lengths) : 0,
      },
      detectedFeatures: features,
    };
  } catch (error) {
    return mapOcctError(error, 'Edge analysis');
  }
}
