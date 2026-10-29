import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { SidecarClient } from '../src/sidecar/client.js';
import { readStepLengthUnit } from '../src/domain/step-units.js';
import type { SidecarEntity } from '../src/sidecar/operations.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const launcher = process.env['CAD_MCP_SIDECAR_LAUNCHER'];
const enabled = Boolean(executable && existsSync(executable));

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** One decoded CVM1 chunk. */
interface DecodedChunk {
  vertexCount: number;
  triangles: number;
  triangleToFace: number[];
  /** Area of one triangle, in the model's declared unit squared. */
  triangleArea: (index: number) => number;
  /** One vertex, in the model's declared unit. */
  vertex: (index: number) => [number, number, number];
}

/**
 * Decode the CVM1 frame the sidecar returns.
 *
 * Layout: 32-byte header (`CVM1`, format version, vertex count, index count,
 * triangle count, then the three byte lengths), positions, normals, indices, and
 * one face slot per triangle.
 * @param bytes - the binary frame.
 * @returns the decoded arrays and a triangle-area accessor.
 */
function decode(bytes: Buffer): DecodedChunk {
  expect(bytes.toString('ascii', 0, 4)).toBe('CVM1');
  expect(bytes.readUInt32LE(4)).toBe(1);
  const vertexCount = bytes.readUInt32LE(8);
  const indexCount = bytes.readUInt32LE(12);
  const triangleCount = bytes.readUInt32LE(16);
  const positionBytes = bytes.readUInt32LE(20);
  const normalBytes = bytes.readUInt32LE(24);
  const indexBytes = bytes.readUInt32LE(28);
  expect(bytes.length).toBe(32 + positionBytes + normalBytes + indexBytes + triangleCount * 4);
  expect(indexCount).toBe(triangleCount * 3);

  const positionsAt = 32;
  const indicesAt = positionsAt + positionBytes + normalBytes;
  const faceAt = indicesAt + indexBytes;
  const vertex = (index: number): [number, number, number] => {
    const base = positionsAt + index * 12;
    return [bytes.readFloatLE(base), bytes.readFloatLE(base + 4), bytes.readFloatLE(base + 8)];
  };
  const triangleToFace: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    triangleToFace.push(bytes.readUInt32LE(faceAt + triangle * 4));
  }

  return {
    vertexCount,
    triangles: triangleCount,
    triangleToFace,
    vertex,
    triangleArea: (index: number) => {
      const [a, b, c] = [0, 1, 2].map((offset) =>
        vertex(bytes.readUInt32LE(indicesAt + (index * 3 + offset) * 4)),
      ) as [[number, number, number], [number, number, number], [number, number, number]];
      const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross: [number, number, number] = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      return Math.hypot(cross[0], cross[1], cross[2]) / 2;
    },
  };
}

describe.skipIf(!enabled)('viewer mesh and measured topology agree', () => {
  let client: SidecarClient | undefined;

  beforeAll(() => {
    client = new SidecarClient({ executable: executable!, ...(launcher ? { launcher } : {}) });
  });

  afterAll(async () => {
    await client?.stop();
  });

  async function open(name: string): Promise<number> {
    const path = fixture(name);
    const units = await readStepLengthUnit(path);
    const opened = await client!.request(
      'open',
      { path, systemLengthUnit: units.mmPerUnit },
      600_000,
    );
    return opened.result.modelId;
  }

  it('tessellates each face into the triangles its own ID claims', async () => {
    const modelId = await open('curved-sector.step');
    const faces = (
      await client!.request('findEntities', { modelId, entityType: 'face', limit: 1000, offset: 0 })
    ).result.entities as SidecarEntity[];
    expect(faces.length).toBeGreaterThan(0);

    // One face per call, so the mesh's face slot cannot be attributed by luck.
    for (const face of faces) {
      const chunk = decode(
        await client!.requestBinary('meshChunk', {
          modelId,
          faceIds: [face.id],
          deflection: 0.2,
          angularDeflection: 0.35,
        }),
      );
      expect(chunk.triangles).toBeGreaterThan(0);
      // Every triangle must claim the single face that was requested.
      expect(new Set(chunk.triangleToFace)).toEqual(new Set([0]));

      const tessellated = Array.from({ length: chunk.triangles }, (_, triangle) =>
        chunk.triangleArea(triangle),
      ).reduce((sum, area) => sum + area, 0);
      const reported = face['area'];
      expect(typeof reported).toBe('number');
      const measured = reported as number;
      // A linear tessellation under-approximates a curved face, so the mesh area
      // must be close to but not exceed the measured area.
      expect(measured).toBeGreaterThan(0);
      expect(tessellated).toBeLessThanOrEqual(measured * 1.001);
      expect(tessellated).toBeGreaterThan(measured * 0.9);
    }

    await client!.request('close', { modelId });
  });

  it('reports one face ID per face, in the order the mesh indexes them', async () => {
    const modelId = await open('curved-sector.step');
    const faces = (
      await client!.request('findEntities', { modelId, entityType: 'face', limit: 1000, offset: 0 })
    ).result.entities as SidecarEntity[];
    const ids = faces.map((face) => face.id);
    expect(ids).toEqual(faces.map((_, index) => `face:${index}`));

    // A multi-face chunk must cover exactly the requested faces, in request order.
    const slots = faces.map((_, index) => index);
    const chunk = decode(
      await client!.requestBinary('meshChunk', {
        modelId,
        faceIds: ids,
        deflection: 0.2,
        angularDeflection: 0.35,
      }),
    );
    expect(new Set(chunk.triangleToFace)).toEqual(new Set(slots));

    await client!.request('close', { modelId });
  });

  it('meshes one assembly occurrence where that occurrence actually is', async () => {
    const modelId = await open('repeated-instances.step');
    const xRangeOf = async (componentName: string): Promise<[number, number]> => {
      const { result } = await client!.request('findEntities', {
        modelId,
        entityType: 'face',
        componentName,
        limit: 1000,
        offset: 0,
      });
      const ids = (result.entities as SidecarEntity[]).map((face) => face.id);
      expect(ids.every((id) => id.startsWith(`component:${componentName}/`))).toBe(true);
      const chunk = decode(
        await client!.requestBinary('meshChunk', {
          modelId,
          faceIds: ids,
          deflection: 0.2,
          angularDeflection: 0.35,
        }),
      );
      const xs = Array.from({ length: chunk.vertexCount }, (_, node) => chunk.vertex(node)[0]);
      return [Math.min(...xs), Math.max(...xs)];
    };

    // The fixture is one 10 mm cube instanced twice, the second translated +20 along x.
    // The two occurrences hold identical local geometry, so identical meshes are only
    // distinguishable by the location each one carries.
    expect(await xRangeOf('RepeatedPart#0')).toEqual([expect.closeTo(0, 3), expect.closeTo(10, 3)]);
    expect(await xRangeOf('RepeatedPart#1')).toEqual([
      expect.closeTo(20, 3),
      expect.closeTo(30, 3),
    ]);

    await client!.request('close', { modelId });
  });
});
