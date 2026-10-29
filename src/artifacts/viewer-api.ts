import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import type { AddressInfo } from 'node:net';
import { sidecarModels } from '../sidecar/models.js';
import type { SidecarClient } from '../sidecar/client.js';
import type { SidecarEntity, SidecarInspect, Vec3 } from '../sidecar/operations.js';
import { parseEntityId } from '../utils/ids.js';

/** Faces the browser materialises in one mesh batch. A batch size, not a ceiling. */
const FACES_PER_CHUNK = 96;

/**
 * Faces the sidecar returns per page.
 *
 * A page size, not a limit on what a model may contain: a part with ten thousand faces is
 * paged ten times rather than refused. Nothing on the viewer path imposes a ceiling —
 * a ceiling would be a claim that a large model cannot be reviewed rather than a fact
 * about it, and the whole point of the exercise is to find out what the model says.
 */
const ENTITY_PAGE = 1000;

/**
 * Tessellation tolerances the chunk endpoint requests. They are reported in the
 * manifest so a client can state the precision it is displaying, and so a change
 * here is visible as a contract change rather than silent drift.
 */
const MESH_LINEAR_DEFLECTION = 0.2;
const MESH_ANGULAR_DEFLECTION = 0.35;
const timingEnabled = process.env.CAD_MCP_TIMING === '1';

type Bbox = [number, number, number, number, number, number];

type ViewerApiOptions = {
  port: number;
  token: string;
};

type ModelRecord = {
  artifactId: string;
  filePath: string;
  /** Content revision (`sha256:…`) of the exact bytes this record describes. */
  revision: string;
  summary?: SidecarInspect;
  /**
   * Face IDs in the model's own addressing, from the id-only listing.
   *
   * IDs alone, because that is all a chunk descriptor needs: grouping faces by occurrence
   * and naming them is identity work. Each face's bounds, surface and area are read only
   * when a caller asks for that face's properties.
   */
  faceIds?: string[];
  bodies?: SidecarEntity[];
  chunks?: MeshChunkDescriptor[];
  units: string;
};

type MeshChunkDescriptor = {
  chunkId: string;
  /**
   * The scope every face in this chunk belongs to: an occurrence qualifier such as
   * `RepeatedPart#1`, or absent when the faces belong to the whole part.
   *
   * Not a body id. In an assembly the occurrence is what distinguishes one face from
   * another — the bodies of its instances are separate solids but the faces are the
   * same faces, at different locations.
   */
  scope?: string;
  faceExternalIds: string[];
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
      writeJson(response, 500, errorBody(error));
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
      const named = url.searchParams.get('faces');
      const faceIds =
        named === null || named === ''
          ? undefined
          : named
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id !== '');
      // A named entity has to be one of this model's entities. An address like `face:1` on an
      // assembly is not — the model's faces are occurrence-qualified — and answering it from
      // the root shape would return IDs the client has never seen, after walking the whole
      // file to do it.
      if (faceIds !== undefined) {
        const known = new Set(record.faceIds ?? []);
        const unknown = faceIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          writeJson(response, 400, {
            error: `Not a face of this model: ${unknown.join(', ')}`,
          });
          return;
        }
      }
      writeJson(
        response,
        200,
        await getEntities(
          record,
          url.searchParams.get('includeEdges') === '1',
          faceIds === undefined ? undefined : new Set(faceIds),
        ),
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

/**
 * The faces of a model, addressed the way every other tool addresses them.
 *
 * A flat file has one numbering over the root shape. An assembly does not: a
 * measurement inside one names a face `component:<name>#<i>/face:N`, and the root's
 * numbering is a different thing that happens to look similar. Listing the
 * occurrence-qualified form is what keeps the face a viewport highlights the same
 * string as the face a measurement returns.
 *
 * Only an assembly is listed that way. A plain part also reports a single
 * occurrence — OCCT gives the free shape one — but `face:N` is what every other tool
 * already calls its faces, so qualifying them here would make the viewer disagree with
 * every measurement and every stored decision about that part.
 *
 * IDs are asked for without properties, which is the whole point of the listing being
 * cheap: a face's bounds and area are an integral over its surface, and nothing on the
 * manifest or mesh path reads them. See `properties: false` in the sidecar.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @param summary - its inspect summary, which carries the occurrence list.
 * @returns face IDs in first-seen order: per occurrence, or over the root shape.
 */
async function listFaces(
  client: SidecarClient,
  modelId: number,
  summary: SidecarInspect,
  properties: boolean,
): Promise<SidecarEntity[]> {
  const xcaf = summary.xcaf;
  const isAssembly = xcaf !== undefined && (xcaf.rootAssemblies > 0 || xcaf.components > 1);
  // A plain part is one unnamed scope; an assembly is listed per occurrence so its IDs are
  // the ones a measurement returns.
  const scopes: (string | undefined)[] = isAssembly ? xcaf.occurrenceIds : [undefined];
  const pages = await Promise.all(
    scopes.map((componentName) => pageFaces(client, modelId, componentName, properties)),
  );
  return pages.flat();
}

/**
 * One scope's faces, however many there are.
 *
 * `ENTITY_PAGE` is a wire page size, not a limit on what a model may contain: a part with
 * ten thousand faces is paged ten times rather than refused. Nothing in the viewer path
 * imposes a ceiling, because a ceiling would be a claim that a large model cannot be
 * reviewed rather than a fact about it.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @param componentName - occurrence to scope to, or undefined for the whole part.
 * @param properties - whether to read each face's geometry as well as its ID.
 * @returns every face, in the sidecar's order.
 */
async function pageFaces(
  client: SidecarClient,
  modelId: number,
  componentName: string | undefined,
  properties: boolean,
): Promise<SidecarEntity[]> {
  const faces: SidecarEntity[] = [];
  for (let offset = 0; ; offset += ENTITY_PAGE) {
    const page = (
      await client.request('findEntities', {
        modelId,
        entityType: 'face',
        limit: ENTITY_PAGE,
        offset,
        properties,
        ...(componentName === undefined ? {} : { componentName }),
      })
    ).result;
    faces.push(...page.entities);
    // Stop on the sidecar's own count, and also when a page adds nothing: a server that
    // never advances must not become an infinite loop.
    if (page.entities.length === 0 || faces.length >= page.total_matched) return faces;
  }
}

/**
 * The faces a caller named, read through the components they belong to.
 *
 * Resolving a face ID against the whole model means mapping every face in the file — on an
 * assembly that is the difference between milliseconds and half a minute — and the component
 * is already in the ID. Naming the component lists its faces; the exact IDs then select which
 * of them are returned.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @param ids - the face IDs to read.
 * @returns those faces, with their properties, in the sidecar's order.
 */
async function readNamedFaces(
  client: SidecarClient,
  modelId: number,
  ids: readonly string[],
): Promise<SidecarEntity[]> {
  const byComponent = new Map<string | undefined, string[]>();
  for (const id of ids) {
    const component = parseEntityId(id)?.component;
    const group = byComponent.get(component) ?? [];
    group.push(id);
    byComponent.set(component, group);
  }
  const faces: SidecarEntity[] = [];
  for (const [component, group] of byComponent) {
    // The sidecar takes at most 1000 IDs per call; naming more is paged rather than refused.
    for (let start = 0; start < group.length; start += ENTITY_PAGE) {
      const page = (
        await client.request('findEntities', {
          modelId,
          entityType: 'face',
          entityIds: group.slice(start, start + ENTITY_PAGE),
          ...(component === undefined ? {} : { componentName: component }),
        })
      ).result;
      faces.push(...page.entities);
    }
  }
  return faces;
}

/**
 * Every entity of one kind with the properties the sidecar computes for it.
 *
 * Used for the body list, and for the edge list when a caller asks for one. Faces go through
 * `listFaces` and `readNamedFaces` instead, because a face is addressed through the component
 * it belongs to and reading one by ID out of the whole model walks every face in the file.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @param entityType - edge, vertex, or body.
 * @returns every entity of that kind, in the sidecar's order.
 */
async function readEntities(
  client: SidecarClient,
  modelId: number,
  entityType: string,
): Promise<SidecarEntity[]> {
  const entities: SidecarEntity[] = [];
  for (let offset = 0; ; offset += ENTITY_PAGE) {
    const page = (
      await client.request('findEntities', {
        modelId,
        entityType,
        limit: ENTITY_PAGE,
        offset,
      })
    ).result;
    entities.push(...page.entities);
    if (page.entities.length === 0 || entities.length >= page.total_matched) return entities;
  }
}

/**
 * A record's summary and face IDs, each fetched at most once and cached on the record.
 * @param record - the viewer record.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @returns the record's summary and face IDs.
 */
async function ensureFaceIds(
  record: ModelRecord,
  client: SidecarClient,
  modelId: number,
): Promise<{ summary: SidecarInspect; faceIds: string[] }> {
  const summary = record.summary ?? (await client.request('inspect', { modelId })).result;
  record.summary = summary;
  const faceIds =
    record.faceIds ??
    (await timed('cad_mcp.viewer.faces', { artifactId: record.artifactId }, async () =>
      (await listFaces(client, modelId, summary, false)).map((face) => face.id),
    ));
  record.faceIds = faceIds;
  return { summary, faceIds };
}

/**
 * A record's body list, fetched on the first request that needs it.
 * @param record - the viewer record.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @returns the model's bodies.
 */
async function ensureBodies(
  record: ModelRecord,
  client: SidecarClient,
  modelId: number,
): Promise<SidecarEntity[]> {
  const bodies = record.bodies ?? (await readEntities(client, modelId, 'body'));
  record.bodies = bodies;
  return bodies;
}

async function openModel(filePath: string) {
  const startedAt = performance.now();
  return sidecarModels.withModel(
    filePath,
    async (client, modelId, resolvedPath, revision, units) => {
      const details = { filePath: resolvedPath };
      // The artifact handle identifies one (path, revision) pair, while `revision`
      // alone is the content identity. Keying the handle on the revision only
      // would make two files with identical bytes share one record, and the
      // stale-record sweep below would then delete the other path's entry.
      const artifactId = createArtifactId(`${resolvedPath}:${revision}`);
      // A record already describes this exact revision of this file: its summary, its faces
      // and its chunks were computed from these same bytes. Recomputing them is a minute of
      // work on a large assembly, so an open that names a record we already hold is answered
      // from it. Nothing here can be stale — the key contains the file's content hash.
      const known = records.get(artifactId);
      if (known !== undefined) return openHandle(known);
      const { result: summary } = await timed('cad_mcp.viewer.open_model.summary', details, () =>
        client.request('inspect', { modelId }),
      );
      // Faces come after the summary, not with it: an assembly's face list is derived
      // from the occurrence list the summary carries. Only IDs are read, and the body list
      // is left for whoever asks for entity properties.
      const faceIds = (await listFaces(client, modelId, summary, false)).map((face) => face.id);
      for (const [existingId, record] of records) {
        if (record.filePath === resolvedPath && record.revision !== revision) {
          records.delete(existingId);
        }
      }
      const record: ModelRecord = {
        artifactId,
        filePath: resolvedPath,
        revision,
        summary,
        faceIds,
        units: units.name,
      };
      records.set(artifactId, record);
      if (timingEnabled)
        console.error('cad_mcp.viewer.open_model.total', {
          ...details,
          artifactId,
          revision,
          bodyCount: summary.solids,
          faceCount: summary.faces,
          edgeCount: summary.edges,
          elapsedMs: elapsedMs(startedAt),
        });
      return openHandle(record);
    },
  );
}

/** The handle an open returns, from a record that already holds everything it needs. */
function openHandle(record: ModelRecord) {
  return {
    artifactId: record.artifactId,
    fileHash: record.revision,
    sourceFileName: basename(record.filePath),
    sourceFilePath: record.filePath,
    units: record.units,
    entityCount:
      (record.summary?.solids ?? 0) + (record.summary?.faces ?? 0) + (record.summary?.edges ?? 0),
  };
}

async function getEntities(record: ModelRecord, includeEdges: boolean, named?: Set<string>) {
  return sidecarModels.withModel(
    record.filePath,
    async (client, modelId) => {
      const { summary, faceIds } = await ensureFaceIds(record, client, modelId);
      // The properties a caller asked for, and only those: a client showing one feature should
      // not make the kernel compute the surface integral of every other face on the assembly.
      const faces =
        named === undefined
          ? await listFaces(client, modelId, summary, true)
          : await readNamedFaces(client, modelId, [...named]);
      // A label is the face's place in the model, so narrowing the list does not renumber it.
      const positions = new Map(faceIds.map((id, index) => [id, index] as const));
      const faceRecords = faces.map((face) => ({
        externalId: face.id,
        kind: 'face',
        label: `Face ${positions.get(face.id) ?? 0}`,
        bbox: entityBounds(face),
        centroid: face.bbox_center,
        surfaceType: face.surface_type,
        area: face.area,
        radius: face.radius,
        normal: face.normal,
        ref: entityRef(record.artifactId, face.id, 'face'),
      }));
      // A request that names faces is about those faces, so it answers with them alone. The
      // body list is a different question, and on an assembly it is an expensive one: a volume
      // integral over every solid, paid by a client that asked about one face.
      if (named !== undefined) return faceRecords;
      const bodies = await ensureBodies(record, client, modelId);
      const edges = includeEdges ? await readEntities(client, modelId, 'edge') : [];
      return [
        ...bodies.map((body, index) => ({
          externalId: body.id,
          kind: 'body',
          label: `Body ${index}`,
          bbox: entityBounds(body),
          centroid: body.bbox_center,
          ref: entityRef(record.artifactId, body.id, 'body'),
        })),
        ...faceRecords,
        ...edges.map((edge, index) => ({
          externalId: edge.id,
          kind: 'edge',
          label: `Edge ${index}`,
          bbox: entityBounds(edge),
          centroid: edge.bbox_center,
          curveType: edge.curve_type,
          length: edge.length,
          radius: edge.radius,
          ref: entityRef(record.artifactId, edge.id, 'edge'),
        })),
      ];
    },
    record.revision,
  );
}

async function getManifest(record: ModelRecord) {
  return sidecarModels.withModel(
    record.filePath,
    async (client, modelId) => {
      const { summary, faceIds } = await ensureFaceIds(record, client, modelId);
      const chunks = record.chunks ?? buildChunkDescriptors(faceIds);
      record.chunks = chunks;
      return {
        artifactId: record.artifactId,
        fileHash: record.revision,
        sourceFileName: basename(record.filePath),
        sourceFilePath: record.filePath,
        units: record.units,
        meshing: {
          linearDeflection: MESH_LINEAR_DEFLECTION,
          angularDeflection: MESH_ANGULAR_DEFLECTION,
          linearUnits: record.units,
        },
        bbox: [...summary.bounds.min, ...summary.bounds.max],
        counts: {
          bodies: summary.solids,
          faces: faceIds.length,
          edges: summary.edges,
        },
        chunks,
      };
    },
    record.revision,
  );
}

/** Face bounds as returned by the sidecar; the rest of the entity is opaque. */
function entityBbox(entity: SidecarEntity): { min: Vec3; max: Vec3 } {
  if (!entity.bbox) throw new Error(`sidecar entity ${entity.id} is missing a bounding box`);
  return entity.bbox;
}

/** An entity's 6-element bounds, as the viewer expects them. */
function entityBounds(entity: SidecarEntity): Bbox {
  const box = entityBbox(entity);
  return [...box.min, ...box.max] as Bbox;
}

/**
 * The scope a face belongs to: an occurrence qualifier, or nothing for the whole part.
 *
 * Parsed with the same grammar every other tool uses rather than by taking the string
 * apart here, so a change to the ID form cannot silently make the viewer group faces
 * by something that is not the scope.
 * @param id - a face ID from the sidecar.
 * @returns the occurrence qualifier, or undefined for a whole-part face.
 */
function scopeOf(id: string): string | undefined {
  const parsed = parseEntityId(id);
  if (parsed === null) throw new Error(`sidecar returned an unreadable entity id: ${id}`);
  if (parsed.component === undefined) return undefined;
  return parsed.instance === undefined
    ? parsed.component
    : `${parsed.component}#${parsed.instance}`;
}

function buildChunkDescriptors(faceIds: readonly string[]): MeshChunkDescriptor[] {
  // Grouped by scope, so one chunk never mixes two occurrences: they are the same
  // geometry at different locations, and a chunk is the unit a client loads and
  // reports against.
  const byScope = new Map<string | undefined, string[]>();
  for (const id of faceIds) {
    const scope = scopeOf(id);
    const group = byScope.get(scope) ?? [];
    group.push(id);
    byScope.set(scope, group);
  }

  const chunks: MeshChunkDescriptor[] = [];
  for (const [scope, scopeFaceIds] of byScope) {
    const label = scope ?? 'part';
    for (let start = 0; start < scopeFaceIds.length; start += FACES_PER_CHUNK) {
      const batch = scopeFaceIds.slice(start, start + FACES_PER_CHUNK);
      chunks.push({
        chunkId: `${label}:chunk:${Math.floor(start / FACES_PER_CHUNK)}`,
        ...(scope === undefined ? {} : { scope }),
        faceExternalIds: batch,
        priority: chunks.length,
        lods: [{ level: 'preview', status: 'ready' }],
      });
    }
  }
  return chunks;
}

async function getMeshChunk(record: ModelRecord, chunkId: string) {
  const startedAt = performance.now();
  return sidecarModels.withModel(
    record.filePath,
    async (client, modelId) => {
      const details = { artifactId: record.artifactId, chunkId, filePath: record.filePath };
      const { faceIds } = await ensureFaceIds(record, client, modelId);
      const chunk = timedSync('cad_mcp.viewer.chunk.descriptor', details, () =>
        (record.chunks ??= buildChunkDescriptors(faceIds)).find((item) => item.chunkId === chunkId),
      );
      if (!chunk) throw new Error(`Unknown mesh chunk: ${chunkId}`);
      // Face IDs travel through unchanged. Turning them back into indices would
      // reintroduce the whole-model numbering that has no meaning for an assembly,
      // and would make the meshed face a different thing from the marked one.
      const chunkFaceIds = chunk.faceExternalIds;
      const encoded = await timed('cad_mcp.viewer.chunk.mesh_batch', details, () =>
        client.requestBinary('meshChunk', {
          modelId,
          faceIds: chunkFaceIds,
          deflection: MESH_LINEAR_DEFLECTION,
          angularDeflection: MESH_ANGULAR_DEFLECTION,
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
    },
    record.revision,
  );
}

function createArtifactId(input: string): string {
  return createHash('sha256').update(input).digest('base64url').slice(0, 24);
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
