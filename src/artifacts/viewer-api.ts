import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { sidecarModels } from '../sidecar/models.js';

const FACES_PER_CHUNK = 96;
const timingEnabled = process.env.CAD_MCP_TIMING === '1';

type Bbox = [number, number, number, number, number, number];

type ViewerApiOptions = {
  port: number;
  token: string;
};

type ModelRecord = {
  artifactId: string;
  filePath: string;
  cacheKey: string;
  summary?: Record<string, any>;
  faces?: Array<Record<string, any>>;
  bodies?: Array<Record<string, any>>;
  chunks?: MeshChunkDescriptor[];
};

type MeshChunkDescriptor = {
  chunkId: string;
  bodyExternalId?: string;
  faceExternalIds: string[];
  bbox: Bbox;
  priority: number;
  lods: Array<{ level: 'preview'; status: 'ready' }>;
};

const records = new Map<string, ModelRecord>();

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

async function timed<T>(
  event: string,
  details: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const value = await run();
    if (timingEnabled) console.error(event, { ...details, elapsedMs: elapsedMs(startedAt) });
    return value;
  } catch (error) {
    if (timingEnabled)
      console.error(`${event}.failed`, { ...details, elapsedMs: elapsedMs(startedAt), error });
    throw error;
  }
}

function timedSync<T>(event: string, details: Record<string, unknown>, run: () => T): T {
  const startedAt = performance.now();
  try {
    const value = run();
    if (timingEnabled) console.error(event, { ...details, elapsedMs: elapsedMs(startedAt) });
    return value;
  } catch (error) {
    if (timingEnabled)
      console.error(`${event}.failed`, { ...details, elapsedMs: elapsedMs(startedAt), error });
    throw error;
  }
}

export type ViewerApiHandle = {
  endpoint: string;
  token: string;
  close: () => Promise<void>;
};

export function createViewerApiToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function startViewerArtifactApi(options: ViewerApiOptions): Promise<ViewerApiHandle> {
  const server = createServer((request, response) => {
    handleRequest(request, response, options.token).catch((error: unknown) => {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    token: options.token,
    close: async () => {
      records.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, token: string) {
  if (request.method === 'OPTIONS') {
    writeCorsPreflight(response);
    return;
  }

  if (request.headers.authorization !== `Bearer ${token}`) {
    writeJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/models') {
    const body = await readJson(request);
    if (!body || typeof body.filePath !== 'string') {
      writeJson(response, 400, { error: 'filePath is required' });
      return;
    }
    if (timingEnabled)
      console.error('CAD kernel artifact API opening model', { filePath: body.filePath });
    try {
      writeJson(response, 200, await openModel(body.filePath));
    } catch (error) {
      console.error('CAD kernel artifact API failed to open model', {
        filePath: body.filePath,
        error,
      });
      writeJson(response, 500, errorBody(error));
    }
    return;
  }

  if (parts[0] === 'models' && parts[1]) {
    const artifactId = decodeURIComponent(parts[1]);
    const record = records.get(artifactId);
    if (!record) {
      writeJson(response, 404, { error: `Unknown artifact: ${artifactId}` });
      return;
    }

    if (request.method === 'GET' && parts[2] === 'entities') {
      writeJson(
        response,
        200,
        await getEntities(record, url.searchParams.get('includeEdges') === '1'),
      );
      return;
    }

    if (request.method === 'GET' && parts[2] === 'manifest') {
      writeJson(response, 200, await getManifest(record));
      return;
    }

    if (request.method === 'GET' && parts[2] === 'chunks' && parts[3]) {
      writeBinary(response, await getMeshChunk(record, decodeURIComponent(parts[3])));
      return;
    }

    if (request.method === 'DELETE' && parts.length === 2) {
      records.delete(artifactId);
      response.writeHead(204).end();
      return;
    }
  }

  writeJson(response, 404, { error: 'Not found' });
}

async function openModel(filePath: string) {
  const startedAt = performance.now();
  return sidecarModels.withModel(filePath, async (client, modelId, resolvedPath) => {
    const details = { filePath: resolvedPath };
    const [{ result: summary }, { result: faces }, { result: bodies }] = await Promise.all([
      timed('cad_mcp.viewer.open_model.summary', details, () =>
        client.request<Record<string, any>>('inspect', { modelId }),
      ),
      client.request<{ entities: Array<Record<string, any>>; total_matched: number }>(
        'findEntities',
        { modelId, entityType: 'face', limit: 1000, offset: 0 },
      ),
      client.request<{ entities: Array<Record<string, any>>; total_matched: number }>(
        'findEntities',
        { modelId, entityType: 'body', limit: 1000, offset: 0 },
      ),
    ]);
    if (faces.total_matched > 1000 || summary.faces > 1000)
      throw new Error('Viewer artifact currently supports models with at most 1000 faces');
    const fileStat = await stat(resolvedPath);
    const cacheKey = `${resolvedPath}:${fileStat.size}:${fileStat.mtimeMs}`;
    const artifactId = createArtifactId(cacheKey);
    for (const [existingId, record] of records) {
      if (record.filePath === resolvedPath && record.cacheKey !== cacheKey) {
        records.delete(existingId);
      }
    }
    records.set(artifactId, {
      artifactId,
      filePath: resolvedPath,
      cacheKey,
      summary,
      faces: faces.entities,
      bodies: bodies.entities,
    });
    if (timingEnabled)
      console.error('cad_mcp.viewer.open_model.total', {
        ...details,
        artifactId,
        bodyCount: summary.solids,
        faceCount: summary.faces,
        edgeCount: summary.edges,
        elapsedMs: elapsedMs(startedAt),
      });
    return {
      artifactId,
      fileHash: createArtifactId(cacheKey),
      sourceFileName: basename(resolvedPath),
      sourceFilePath: resolvedPath,
      units: 'mm',
      entityCount: summary.solids + summary.faces + summary.edges,
    };
  });
}

async function getEntities(record: ModelRecord, includeEdges: boolean) {
  return sidecarModels.withModel(record.filePath, async (client, modelId) => {
    const faces =
      record.faces ??
      (
        await client.request<{ entities: Array<Record<string, any>> }>('findEntities', {
          modelId,
          entityType: 'face',
          limit: 1000,
          offset: 0,
        })
      ).result.entities;
    record.faces = faces;
    const bodies =
      record.bodies ??
      (
        await client.request<{ entities: Array<Record<string, any>> }>('findEntities', {
          modelId,
          entityType: 'body',
          limit: 1000,
          offset: 0,
        })
      ).result.entities;
    record.bodies = bodies;
    const edges = includeEdges
      ? (
          await client.request<{ entities: Array<Record<string, any>> }>('findEntities', {
            modelId,
            entityType: 'edge',
            limit: 1000,
            offset: 0,
          })
        ).result.entities
      : [];
    return [
      ...bodies.map((body, index) => ({
        externalId: body.id,
        kind: 'body',
        label: `Body ${index}`,
        bbox: [...body.bbox.min, ...body.bbox.max],
        centroid: body.bbox_center,
        ref: entityRef(record.artifactId, body.id, 'body'),
      })),
      ...faces.map((face, index) => ({
        externalId: face.id,
        kind: 'face',
        label: `Face ${index}`,
        bbox: [...face.bbox.min, ...face.bbox.max],
        centroid: face.bbox_center,
        surfaceType: face.surface_type,
        area: face.area,
        radius: face.radius,
        normal: face.normal,
        ref: entityRef(record.artifactId, face.id, 'face'),
      })),
      ...edges.map((edge, index) => ({
        externalId: edge.id,
        kind: 'edge',
        label: `Edge ${index}`,
        bbox: [...edge.bbox.min, ...edge.bbox.max],
        centroid: edge.bbox_center,
        curveType: edge.curve_type,
        length: edge.length,
        radius: edge.radius,
        ref: entityRef(record.artifactId, edge.id, 'edge'),
      })),
    ];
  });
}

async function getManifest(record: ModelRecord) {
  return sidecarModels.withModel(record.filePath, async (client, modelId) => {
    const summary =
      record.summary ?? (await client.request<Record<string, any>>('inspect', { modelId })).result;
    const faces =
      record.faces ??
      (
        await client.request<{ entities: Array<Record<string, any>> }>('findEntities', {
          modelId,
          entityType: 'face',
          limit: 1000,
          offset: 0,
        })
      ).result.entities;
    record.summary = summary;
    record.faces = faces;
    const chunks = record.chunks ?? buildChunkDescriptors(faces);
    record.chunks = chunks;
    return {
      artifactId: record.artifactId,
      fileHash: createArtifactId(record.cacheKey),
      sourceFileName: basename(record.filePath),
      sourceFilePath: record.filePath,
      units: 'mm',
      bbox: [...summary.bounds.min, ...summary.bounds.max],
      counts: {
        bodies: summary.solids,
        faces: faces.length,
        edges: summary.edges,
      },
      chunks,
    };
  });
}

function buildChunkDescriptors(faces: Array<Record<string, any>>): MeshChunkDescriptor[] {
  const byBody = new Map<string, Array<Record<string, any>>>();
  for (const face of faces) {
    const bodyId = 'body:0';
    const bodyFaces = byBody.get(bodyId) ?? [];
    bodyFaces.push(face);
    byBody.set(bodyId, bodyFaces);
  }

  const chunks: MeshChunkDescriptor[] = [];
  for (const [bodyExternalId, bodyFaces] of byBody) {
    for (let start = 0; start < bodyFaces.length; start += FACES_PER_CHUNK) {
      const batch = bodyFaces.slice(start, start + FACES_PER_CHUNK);
      chunks.push({
        chunkId: `${bodyExternalId}:chunk:${Math.floor(start / FACES_PER_CHUNK)}`,
        bodyExternalId,
        faceExternalIds: batch.map((face) => face.id),
        bbox: unionBboxes(batch.map((face) => [...face.bbox.min, ...face.bbox.max] as Bbox)),
        priority: chunks.length,
        lods: [{ level: 'preview', status: 'ready' }],
      });
    }
  }
  return chunks;
}

async function getMeshChunk(record: ModelRecord, chunkId: string) {
  const startedAt = performance.now();
  return sidecarModels.withModel(record.filePath, async (client, modelId) => {
    const details = { artifactId: record.artifactId, chunkId, filePath: record.filePath };
    const faces =
      record.faces ??
      (
        await timed('cad_mcp.viewer.chunk.faces', details, () =>
          client.request<{ entities: Array<Record<string, any>> }>('findEntities', {
            modelId,
            entityType: 'face',
            limit: 1000,
            offset: 0,
          }),
        )
      ).result.entities;
    record.faces = faces;
    const chunk = timedSync('cad_mcp.viewer.chunk.descriptor', details, () =>
      (record.chunks ??= buildChunkDescriptors(faces)).find((item) => item.chunkId === chunkId),
    );
    if (!chunk) throw new Error(`Unknown mesh chunk: ${chunkId}`);
    const faceIndices = chunk.faceExternalIds.map((id) => Number(id.slice('face:'.length)));
    const encoded = await timed('cad_mcp.viewer.chunk.mesh_batch', details, () =>
      client.requestBinary('meshChunk', {
        modelId,
        faceIndices,
        deflection: 0.2,
        angularDeflection: 0.35,
      }),
    );
    if (encoded.length < 32 || encoded.toString('ascii', 0, 4) !== 'CVM1')
      throw new Error('OCCT sidecar returned an invalid CVM1 mesh chunk');
    if (timingEnabled)
      console.error('cad_mcp.viewer.chunk.total', {
        ...details,
        byteLength: encoded.byteLength,
        elapsedMs: elapsedMs(startedAt),
      });
    return encoded;
  });
}

function createArtifactId(input: string): string {
  return createHash('sha256').update(input).digest('base64url').slice(0, 24);
}

function unionBboxes(boxes: Bbox[]): Bbox {
  if (!boxes.length) return [0, 0, 0, 0, 0, 0];
  return boxes.reduce<Bbox>(
    (acc, box) => [
      Math.min(acc[0], box[0]),
      Math.min(acc[1], box[1]),
      Math.min(acc[2], box[2]),
      Math.max(acc[3], box[3]),
      Math.max(acc[4], box[4]),
      Math.max(acc[5], box[5]),
    ],
    boxes[0],
  );
}

function entityRef(artifactId: string, externalId: string, kind: string) {
  return { serverId: 'cad-mcp-server', artifactId, externalId, kind };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  response.end(JSON.stringify(body));
}

function writeBinary(response: ServerResponse, body: Buffer) {
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  response.end(body);
}

function writeCorsPreflight(response: ServerResponse) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
  });
  response.end();
}

function errorBody(error: unknown) {
  if (error instanceof Error) return { error: error.message };
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      error: typeof record.message === 'string' ? record.message : JSON.stringify(record),
      type: typeof record.type === 'string' ? record.type : undefined,
    };
  }
  return { error: String(error) };
}
