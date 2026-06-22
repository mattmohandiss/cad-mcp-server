import { realpath, stat } from 'node:fs/promises';
import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { AnalysisError } from './utils/errors.js';
import type { BRepBody, BRepModel } from './types/brep.js';
import type { SemanticModel } from './types/semantic.js';
import type {
  PmiAnnotationEntity,
  PmiDatumEntity,
  PmiDimensionEntity,
  PmiToleranceEntity,
} from './pmi/parser.js';
import { extractPmiEntities } from './pmi/parser.js';
import { LightweightStepSemanticProvider } from './pmi/semantic-provider.js';
import { getOcctKernel } from './kernel/kernel.js';
import { mapOcctError, readStepText } from './kernel/import.js';
import { getDimensions, guessShapeClass, toBoundingBox } from './kernel/measure.js';
import { getEdgeStatistics } from './kernel/topology.js';
import {
  buildBodyMap,
  extractEdgeEntities,
  extractFaceEntities,
  type ExtractedEdgeEntity,
  type ExtractedFaceEntity,
} from './kernel/query-entities.js';
import { makeId } from './utils/ids.js';

type PmiEntity = PmiToleranceEntity | PmiDimensionEntity | PmiDatumEntity | PmiAnnotationEntity;

interface FileKey {
  requestedPath: string;
  resolvedPath: string;
  size: number;
  mtimeMs: number;
}

interface ShapeContext {
  kernel: OcctKernel;
  shape: ShapeHandle;
}

const semanticProvider = new LightweightStepSemanticProvider();

class LoadedStepModel {
  readonly requestedPath: string;
  readonly resolvedPath: string;
  readonly cacheKey: string;
  lastAccess = Date.now();
  activeUsers = 0;

  private stepTextPromise?: Promise<string>;
  private shapePromise?: Promise<ShapeContext>;
  private bodyMap?: { faceBody: number[]; edgeBody: number[] };
  private faceEntities?: ExtractedFaceEntity[];
  private faceEntitiesWithBody?: ExtractedFaceEntity[];
  private edgeEntities?: ExtractedEdgeEntity[];
  private edgeEntitiesWithBody?: ExtractedEdgeEntity[];
  private brepPromise?: Promise<BRepModel>;
  private semanticPromise?: Promise<SemanticModel>;
  private pmiPromise?: Promise<{ pmi_entities: PmiEntity[] }>;

  constructor(fileKey: FileKey) {
    this.requestedPath = fileKey.requestedPath;
    this.resolvedPath = fileKey.resolvedPath;
    this.cacheKey = `${fileKey.resolvedPath}:${fileKey.size}:${fileKey.mtimeMs}`;
  }

  async getShapeContext(action = 'STEP import'): Promise<ShapeContext> {
    this.lastAccess = Date.now();
    this.shapePromise ??= this.importShape(action);
    return this.shapePromise;
  }

  async getFaceEntities(includeBodyId: boolean): Promise<ExtractedFaceEntity[]> {
    this.lastAccess = Date.now();
    if (includeBodyId) {
      this.faceEntitiesWithBody ??= extractFaceEntities(
        ...(await this.shapeAndBodyMap('query_step_faces'))
      );
      return this.faceEntitiesWithBody;
    }

    if (!this.faceEntities) {
      const { kernel, shape } = await this.getShapeContext('query_step_faces');
      this.faceEntities = extractFaceEntities(kernel, shape);
    }
    return this.faceEntities;
  }

  async getEdgeEntities(includeBodyId: boolean): Promise<ExtractedEdgeEntity[]> {
    this.lastAccess = Date.now();
    if (includeBodyId) {
      this.edgeEntitiesWithBody ??= extractEdgeEntities(
        ...(await this.shapeAndBodyMap('query_step_edges'))
      );
      return this.edgeEntitiesWithBody;
    }

    if (!this.edgeEntities) {
      const { kernel, shape } = await this.getShapeContext('query_step_edges');
      this.edgeEntities = extractEdgeEntities(kernel, shape);
    }
    return this.edgeEntities;
  }

  async getBRepModel(): Promise<BRepModel> {
    this.lastAccess = Date.now();
    this.brepPromise ??= this.buildBRepModel();
    return this.brepPromise;
  }

  async getSemanticModel(): Promise<SemanticModel> {
    this.lastAccess = Date.now();
    this.semanticPromise ??= semanticProvider.extract(this.resolvedPath);
    return this.semanticPromise;
  }

  async getPmiEntities(): Promise<{ pmi_entities: PmiEntity[] }> {
    this.lastAccess = Date.now();
    this.pmiPromise ??= extractPmiEntities(this.resolvedPath) as Promise<{
      pmi_entities: PmiEntity[];
    }>;
    return this.pmiPromise;
  }

  dispose(): void {
    if (!this.shapePromise) return;
    void this.shapePromise
      .then(({ kernel, shape }) => kernel.release(shape))
      .catch(() => undefined);
  }

  async use<T>(run: (model: LoadedStepModel) => Promise<T>): Promise<T> {
    this.activeUsers++;
    try {
      return await run(this);
    } finally {
      this.activeUsers--;
      this.lastAccess = Date.now();
    }
  }

  private async importShape(action: string): Promise<ShapeContext> {
    try {
      const stepText = await this.getStepText();
      const kernel = await getOcctKernel();
      return { kernel, shape: kernel.importStep(stepText) };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
        throw error;
      }
      throw mapOcctError(error, action);
    }
  }

  private async getStepText(): Promise<string> {
    this.stepTextPromise ??= readStepText(this.resolvedPath);
    return this.stepTextPromise;
  }

  private async shapeAndBodyMap(
    action: string
  ): Promise<[OcctKernel, ShapeHandle, { faceBody: number[]; edgeBody: number[] }]> {
    const { kernel, shape } = await this.getShapeContext(action);
    this.bodyMap ??= buildBodyMap(kernel, shape);
    return [kernel, shape, this.bodyMap];
  }

  private async buildBRepModel(): Promise<BRepModel> {
    const { kernel, shape } = await this.getShapeContext('STEP import');
    const boundingBox = toBoundingBox(kernel, shape);
    const dimensions = getDimensions(boundingBox);
    const solids = kernel.getSubShapes(shape, 'solid');
    const faces = kernel.getSubShapes(shape, 'face');
    const bodyShapes = solids.length ? solids : [shape];
    const bodies = bodyShapes.map((body, index): BRepBody => {
      const bodyBox = bodyShapes.length === 1 ? boundingBox : toBoundingBox(kernel, body);
      return {
        id: makeId('body', index),
        index,
        boundingBox: bodyBox,
        dimensions: getDimensions(bodyBox),
        volume: kernel.getVolume(body),
        surfaceArea: kernel.getSurfaceArea(body),
      };
    });

    return {
      provider: {
        name: 'occt-wasm',
        capabilities: [
          'step_import',
          'body_metrics',
          'edge_statistics',
          'surface_types',
          'curve_types',
        ],
        limitations: [],
      },
      filePath: this.requestedPath,
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
      health: {
        isValid: safeIsValid(kernel, shape),
        warnings: [],
      },
      provenance: [{ provider: 'occt-wasm', sourceId: 'brep:shape', method: 'measured' }],
    };
  }
}

class StepModelStore {
  private readonly maxModels = 5;
  private readonly models = new Map<string, LoadedStepModel>();

  async get(filePath: string): Promise<LoadedStepModel> {
    const fileKey = await resolveFileKey(filePath);
    const existing = this.models.get(fileKey.resolvedPath);
    if (
      existing &&
      existing.cacheKey === `${fileKey.resolvedPath}:${fileKey.size}:${fileKey.mtimeMs}`
    ) {
      existing.lastAccess = Date.now();
      return existing;
    }

    existing?.dispose();
    const model = new LoadedStepModel(fileKey);
    this.models.set(fileKey.resolvedPath, model);
    this.evictIfNeeded();
    return model;
  }

  private evictIfNeeded(): void {
    if (this.models.size <= this.maxModels) return;
    const oldest = [...this.models.entries()]
      .filter(([, model]) => model.activeUsers === 0)
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
    if (!oldest) return;
    oldest[1].dispose();
    this.models.delete(oldest[0]);
  }
}

const store = new StepModelStore();

export async function getStepModel(filePath: string): Promise<LoadedStepModel> {
  return store.get(filePath);
}

export async function withStepModel<T>(
  filePath: string,
  run: (model: LoadedStepModel) => Promise<T>
): Promise<T> {
  const model = await store.get(filePath);
  return model.use(run);
}

async function resolveFileKey(filePath: string): Promise<FileKey> {
  try {
    const [resolvedPath, fileStat] = await Promise.all([realpath(filePath), stat(filePath)]);
    return {
      requestedPath: filePath,
      resolvedPath,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw {
      type: 'file_not_found',
      message: `File not found: ${filePath}. ${message}`,
    } satisfies AnalysisError;
  }
}

function safeIsValid(kernel: OcctKernel, shape: ShapeHandle): boolean | undefined {
  try {
    return kernel.isValid(shape);
  } catch {
    return undefined;
  }
}
