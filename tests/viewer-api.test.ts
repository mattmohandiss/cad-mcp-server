import { afterEach, describe, expect, it, vi } from 'vitest';

const { withModel } = vi.hoisted(() => ({ withModel: vi.fn() }));

vi.mock('../src/sidecar/models.js', () => ({ sidecarModels: { withModel } }));

import { startViewerArtifactApi, type ViewerApiHandle } from '../src/artifacts/viewer-api.js';
import { encodeMeshChunk } from '../src/artifacts/mesh-chunk-format.js';
import type { SidecarInspect } from '../src/sidecar/operations.js';

const TOKEN = 'test-token';
const REVISION = `sha256:${'a'.repeat(64)}`;

/** Minimal inspect result for a single-solid part with two faces. */
function summary(overrides: Partial<SidecarInspect> = {}): SidecarInspect {
  return {
    solids: 1,
    shells: 1,
    faces: 2,
    edges: 4,
    vertices: 4,
    volume: 1,
    volumeAvailable: true,
    volumeBasis: 'solid-only',
    surfaceArea: 6,
    valid: true,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    boundsMethod: 'conservative-envelope',
    ...overrides,
  };
}

/** One entity as the sidecar reports it. */
function entity(id: string) {
  return { id, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, bbox_center: [0.5, 0.5, 0.5] };
}

/** A valid CVM1 chunk with one triangle belonging to the first face. */
function chunkBytes(): Buffer {
  return encodeMeshChunk(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Uint32Array([0, 1, 2]),
    new Uint32Array([0]),
  );
}

/**
 * Install a fake sidecar that records the revision every read asserts, records every request,
 * and answers the operations the viewer API uses.
 */
function installSidecar(inspect: SidecarInspect): {
  expected: (string | undefined)[];
  calls: { op: string; args: Record<string, unknown> }[];
} {
  const expected: (string | undefined)[] = [];
  const calls: { op: string; args: Record<string, unknown> }[] = [];

  /**
   * One page of faces, shaped the way the sidecar shapes it: the true count in
   * `total_matched`, and only the requested window in `entities`. An id-only request gets
   * entities without properties, which is what the sidecar's `properties: false` does.
   */
  const facePage = (args?: {
    componentName?: string;
    entityIds?: string[];
    limit?: number;
    offset?: number;
    properties?: boolean;
  }) => {
    const scoped = args?.componentName;
    const total = scoped === undefined ? inspect.faces : 1;
    const offset = args?.offset ?? 0;
    const limit = args?.limit ?? total;
    const all = Array.from({ length: total }, (_, index) =>
      scoped === undefined ? `face:${index}` : `component:${scoped}/face:${index}`,
    );
    const matches =
      args?.entityIds === undefined ? all : all.filter((id) => args.entityIds?.includes(id));
    return {
      total_matched: matches.length,
      entities: matches
        .slice(offset, offset + limit)
        .map((id) => (args?.properties === false ? { id } : entity(id))),
    };
  };

  withModel.mockImplementation(
    async (
      filePath: string,
      operation: (
        client: unknown,
        modelId: number,
        filePath: string,
        revision: string,
        units: { name: string },
      ) => Promise<unknown>,
      expectedRevision?: string,
    ) => {
      expected.push(expectedRevision);
      const client = {
        request: async (
          op: string,
          args?: {
            entityType?: string;
            componentName?: string;
            entityIds?: string[];
            limit?: number;
            offset?: number;
            properties?: boolean;
          },
        ) => {
          calls.push({ op, args: (args ?? {}) as Record<string, unknown> });
          return {
            result:
              op === 'inspect'
                ? inspect
                : op === 'findEntities'
                  ? args?.entityType === 'body'
                    ? { total_matched: 1, entities: [entity('body:0')] }
                    : args?.entityType === 'edge'
                      ? { total_matched: 4, entities: [entity('edge:0')] }
                      : facePage(args)
                  : {},
          };
        },
        requestBinary: async () => chunkBytes(),
      };
      return operation(client, 1, filePath, REVISION, { name: 'mm' });
    },
  );
  return { expected, calls };
}

describe('viewer artifact API', () => {
  let api: ViewerApiHandle | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    await api?.close();
    api = undefined;
  });

  async function start(): Promise<string> {
    api = await startViewerArtifactApi({ port: 0, token: TOKEN });
    return api.endpoint;
  }

  const get = (endpoint: string, path: string) =>
    fetch(`${endpoint}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

  /** Open a model and return the raw response, so a test can assert a refusal. */
  const post = (endpoint: string, filePath: string) =>
    fetch(`${endpoint}/models`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });

  /** Open a model, assert it was accepted, and return its artifact id. */
  async function open(endpoint: string, filePath: string): Promise<string> {
    const response = await post(endpoint, filePath);
    expect(response.status).toBe(200);
    return ((await response.json()) as { artifactId: string }).artifactId;
  }

  type Manifest = {
    chunks: { chunkId: string; scope?: string; faceExternalIds: string[] }[];
    counts: { bodies: number; faces: number; edges: number };
  };

  async function manifestOf(endpoint: string, artifactId: string): Promise<Manifest> {
    return (await (await get(endpoint, `/models/${artifactId}/manifest`)).json()) as Manifest;
  }

  it('identifies a model by its content revision, not its path and mtime', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const response = await fetch(`${endpoint}/models`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: '/tmp/part.step' }),
    });
    expect(response.status).toBe(200);
    const opened = (await response.json()) as { artifactId: string; fileHash: string };
    expect(opened.fileHash).toBe(REVISION);
    expect(opened.artifactId).not.toContain('/tmp/part.step');
  });

  it('reports units and the tessellation tolerances in the manifest', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const opened = (await (
      await fetch(`${endpoint}/models`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: '/tmp/part.step' }),
      })
    ).json()) as { artifactId: string };
    const manifest = (await (
      await get(endpoint, `/models/${opened.artifactId}/manifest`)
    ).json()) as {
      fileHash: string;
      units: string;
      meshing: { linearDeflection: number; angularDeflection: number; linearUnits: string };
      chunks: { chunkId: string; faceExternalIds: string[] }[];
    };
    expect(manifest.fileHash).toBe(REVISION);
    expect(manifest.units).toBe('mm');
    expect(manifest.meshing).toEqual({
      linearDeflection: 0.2,
      angularDeflection: 0.35,
      linearUnits: 'mm',
    });
    expect(manifest.chunks[0]?.faceExternalIds).toEqual(['face:0', 'face:1']);
  });

  it('asserts the recorded revision on every read after opening', async () => {
    const { expected } = installSidecar(summary());
    const endpoint = await start();
    const opened = (await (
      await fetch(`${endpoint}/models`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: '/tmp/part.step' }),
      })
    ).json()) as { artifactId: string };
    await get(endpoint, `/models/${opened.artifactId}/manifest`);
    const chunk = await get(endpoint, `/models/${opened.artifactId}/chunks/part:chunk:0`);
    expect(chunk.status).toBe(200);
    expect(chunk.headers.get('content-type')).toBe('application/octet-stream');

    // The open itself is unchecked; every later read must assert the revision.
    expect(expected.length).toBe(3);
    expect(expected[0]).toBeUndefined();
    expect(expected[1]).toBe(REVISION);
    expect(expected[2]).toBe(REVISION);
  });

  it('names a chunk after the scope its faces belong to', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const artifactId = await open(endpoint, '/tmp/part.step');
    const manifest = await manifestOf(endpoint, artifactId);
    expect(manifest.chunks[0]?.chunkId).toBe('part:chunk:0');
    // A flat part has one scope, so the descriptor names none: there is no occurrence
    // to distinguish.
    expect(manifest.chunks[0]).not.toHaveProperty('scope');
    expect(manifest.chunks[0]?.faceExternalIds).toEqual(['face:0', 'face:1']);
  });

  it('opens a multi-solid part, naming its faces over the root shape', async () => {
    // A body is not what makes a face addressable: the root shape is, and measurement
    // addresses the same `face:N`, so a highlight and a measurement cannot disagree.
    installSidecar(summary({ solids: 2 }));
    const endpoint = await start();
    const manifest = await manifestOf(endpoint, await open(endpoint, '/tmp/multi.step'));
    expect(manifest.counts.bodies).toBe(2);
    expect(manifest.chunks.map((chunk) => chunk.chunkId)).toEqual(['part:chunk:0']);
    expect(manifest.chunks[0]?.faceExternalIds).toEqual(['face:0', 'face:1']);
  });

  it('opens a model with no solid material, whose faces are still addressable', async () => {
    installSidecar(summary({ solids: 0, volume: null, volumeAvailable: false }));
    const endpoint = await start();
    const manifest = await manifestOf(endpoint, await open(endpoint, '/tmp/shell.step'));
    expect(manifest.counts.bodies).toBe(0);
    expect(manifest.counts.faces).toBe(2);
  });

  it('opens an assembly, naming each face by the occurrence it belongs to', async () => {
    // The ID here has to be the one a measurement returns, because it is the same
    // string the viewport will highlight and the engineer will disagree with.
    installSidecar(
      summary({
        solids: 2,
        xcaf: { roots: 1, rootAssemblies: 1, components: 2, occurrenceIds: ['o1', 'o2'] },
      }),
    );
    const endpoint = await start();
    const artifactId = await open(endpoint, '/tmp/assembly.step');
    const manifest = await manifestOf(endpoint, artifactId);
    expect(manifest.chunks).toEqual([
      {
        chunkId: 'o1:chunk:0',
        scope: 'o1',
        faceExternalIds: ['component:o1/face:0'],
        priority: 0,
        lods: [{ level: 'preview', status: 'ready' }],
      },
      {
        chunkId: 'o2:chunk:0',
        scope: 'o2',
        faceExternalIds: ['component:o2/face:0'],
        priority: 1,
        lods: [{ level: 'preview', status: 'ready' }],
      },
    ]);
    // And a chunk that names an occurrence can be meshed by the same ID.
    const chunk = await get(endpoint, `/models/${artifactId}/chunks/o2:chunk:0`);
    expect(chunk.status).toBe(200);
  });

  it('keeps a plain part on whole-part face IDs even though it reports one occurrence', async () => {
    // OCCT gives a plain part's free shape one occurrence, named after the product. The
    // viewer must still call its faces `face:N`, because that is what every measurement
    // and every stored decision about this part already says.
    installSidecar(
      summary({
        xcaf: {
          roots: 1,
          rootAssemblies: 0,
          components: 1,
          occurrenceIds: ['Open_CASCADE_STEP_translator_7.9_1'],
        },
      }),
    );
    const endpoint = await start();
    const manifest = await manifestOf(endpoint, await open(endpoint, '/tmp/part.step'));
    expect(manifest.chunks.map((chunk) => chunk.chunkId)).toEqual(['part:chunk:0']);
    expect(manifest.chunks[0]?.faceExternalIds).toEqual(['face:0', 'face:1']);
  });

  it('opens a model far past the old face bound, paging the face list', async () => {
    // There is no ceiling any more. A model with more faces than one page is paged
    // rather than refused, and the manifest reports every one of them.
    installSidecar(summary({ faces: 2500 }));
    const endpoint = await start();
    const artifactId = await open(endpoint, '/tmp/huge.step');
    const manifest = await manifestOf(endpoint, artifactId);
    expect(manifest.counts.faces).toBe(2500);
    expect(manifest.chunks.length).toBeGreaterThan(1);
  });

  it('lists faces without computing their geometry', async () => {
    // The manifest path needs to know which faces exist, and nothing else. A face's bounds
    // and area are an integral over its surface, and computing them for every face is about
    // half of what opening a large assembly costs.
    const { calls } = installSidecar(summary());
    const endpoint = await start();
    await open(endpoint, '/tmp/part.step');
    const listings = calls.filter(
      (call) => call.op === 'findEntities' && call.args['entityType'] === 'face',
    );
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((call) => call.args['properties'] === false)).toBe(true);
  });

  it('computes properties only for the faces an entity request names', async () => {
    const { calls } = installSidecar(summary());
    const endpoint = await start();
    const artifactId = await open(endpoint, '/tmp/part.step');
    const response = await get(endpoint, `/models/${artifactId}/entities?faces=face:1`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      externalId: string;
      kind: string;
      label: string;
    }[];
    const faces = body.filter((entry) => entry.kind === 'face');
    expect(faces.map((entry) => entry.externalId)).toEqual(['face:1']);
    // Labelled by its place in the model, so narrowing the list does not renumber the faces.
    expect(faces[0]?.label).toBe('Face 1');
    // And nothing else: the body list is a different question, and an expensive one.
    expect(body.some((entry) => entry.kind === 'body')).toBe(false);

    const asked = calls.filter(
      (call) =>
        call.op === 'findEntities' &&
        call.args['entityType'] === 'face' &&
        call.args['entityIds'] !== undefined,
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]?.args['entityIds']).toEqual(['face:1']);
  });

  it('reads a named face through the component it belongs to', async () => {
    // Reading one face out of the whole model makes the sidecar map every face in the file:
    // on an assembly that is half a minute instead of milliseconds. The component is already
    // in the ID, so the read is scoped by it.
    const { calls } = installSidecar(
      summary({
        solids: 2,
        xcaf: { roots: 1, rootAssemblies: 1, components: 2, occurrenceIds: ['o1', 'o2'] },
      }),
    );
    const endpoint = await start();
    const artifactId = await open(endpoint, '/tmp/assembly.step');
    const response = await get(
      endpoint,
      `/models/${artifactId}/entities?faces=${encodeURIComponent('component:o1/face:0')}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { externalId: string; kind: string }[];
    expect(body.filter((entry) => entry.kind === 'face').map((entry) => entry.externalId)).toEqual([
      'component:o1/face:0',
    ]);

    const asked = calls.filter(
      (call) =>
        call.op === 'findEntities' &&
        call.args['entityType'] === 'face' &&
        call.args['entityIds'] !== undefined,
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]?.args['componentName']).toBe('o1');

    // An address the model does not have is refused rather than answered from the root shape:
    // an assembly's faces are occurrence-qualified, so `face:1` is not one of them.
    const refused = await get(endpoint, `/models/${artifactId}/entities?faces=face:1`);
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain(
      'Not a face of this model',
    );
  });

  it('rejects a request without the bearer token', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const response = await fetch(`${endpoint}/health`);
    expect(response.status).toBe(401);
  });

  it('keeps two paths with identical bytes as separate artifacts', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const open = async (filePath: string) =>
      (await (
        await fetch(`${endpoint}/models`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        })
      ).json()) as { artifactId: string };

    const first = await open('/tmp/part.step');
    const second = await open('/tmp/part-copy.step');
    expect(first.artifactId).not.toBe(second.artifactId);

    // Opening the second path must not evict the first path's record.
    const manifest = await get(endpoint, `/models/${first.artifactId}/manifest`);
    expect(manifest.status).toBe(200);
  });

  it('reports a structured store failure with its own message', async () => {
    installSidecar(summary());
    const endpoint = await start();
    const opened = (await (
      await fetch(`${endpoint}/models`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: '/tmp/part.step' }),
      })
    ).json()) as { artifactId: string };

    // The model store throws a structured object, not an Error; the API must
    // still surface its message rather than "[object Object]".
    withModel.mockImplementation(async () => {
      throw { type: 'stale_reference', message: 'Artifact revision mismatch: expected a, found b' };
    });
    const response = await get(endpoint, `/models/${opened.artifactId}/manifest`);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; type?: string };
    expect(body.error).toContain('Artifact revision mismatch');
    expect(body.type).toBe('stale_reference');
  });
});
