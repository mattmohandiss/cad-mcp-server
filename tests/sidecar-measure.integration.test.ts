import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { SidecarClient } from '../src/sidecar/client.js';
import type { SidecarInspect, SidecarOps } from '../src/sidecar/operations.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const launcher = process.env['CAD_MCP_SIDECAR_LAUNCHER'];
const stepPath =
  process.env['CAD_MCP_TEST_STEP'] ??
  fileURLToPath(new URL('./fixtures/repeated-instances.step', import.meta.url));
const enabled = Boolean(executable && existsSync(executable) && existsSync(stepPath));

describe.skipIf(!enabled)('sidecar measurement integration', () => {
  let client: SidecarClient | undefined;
  let modelId: number | undefined;
  let inspect: SidecarInspect;

  beforeAll(async () => {
    client = new SidecarClient({ executable: executable!, ...(launcher ? { launcher } : {}) });
    const opened = await client.request('open', { path: stepPath }, 600_000);
    modelId = opened.result.modelId;
    inspect = (await client.request('inspect', { modelId })).result;
  }, 600_000);

  afterAll(async () => {
    if (client?.isAlive) {
      if (modelId !== undefined) await client.request('close', { modelId });
      await client.stop();
    }
  });

  it('reports exact dimensions, volume, and area for the fixture', () => {
    const sample = inspect as unknown as {
      volume: number;
      surfaceArea: number;
      bounds: { min: number[]; max: number[] };
    };
    const { min, max } = sample.bounds;
    // The conservative envelope adds the face tolerance, so allow a tiny margin.
    expect(max[0]! - min[0]!).toBeCloseTo(30, 4);
    expect(max[1]! - min[1]!).toBeCloseTo(10, 4);
    expect(max[2]! - min[2]!).toBeCloseTo(10, 4);
    expect(sample.volume).toBeCloseTo(2000, 6);
    expect(sample.surfaceArea).toBeCloseTo(1200, 6);
  });

  const measure = async (args: Omit<SidecarOps['measureGeometry'], 'modelId'>) =>
    (
      await client!.request('measureGeometry', {
        modelId: modelId!,
        ...args,
      })
    ).result.results[0]!.results;

  it('returns results for thickness, draft, rays, points, sections and continuity', async () => {
    const bounds = inspect.bounds as { min: number[]; max: number[] };
    const center = bounds.min.map((v, i) => (v + bounds.max[i]!) / 2);
    const thickness = await measure({
      kind: 'thickness',
      entityIds: ['face:0'],
      directionMode: 'inward_normal',
      spacing: 1000,
    });
    expect(thickness).toHaveProperty('thickness.statistics.total_rays');
    const thicknessStats = (
      thickness as unknown as {
        thickness: {
          statistics: { total_rays: number; min_distance: number; max_distance: number };
        };
      }
    ).thickness.statistics;
    expect(thicknessStats.total_rays).toBeGreaterThan(0);
    expect(thicknessStats.min_distance).toBeCloseTo(10, 9);
    expect(thicknessStats.max_distance).toBeCloseTo(10, 9);

    const draft = await measure({
      kind: 'draft',
      entityIds: ['face:0'],
      direction: [0, 0, 1],
    });
    expect(draft).toHaveProperty('draft_angle.draft_angle_deg');

    const ray = await measure({
      kind: 'ray',
      entityIds: ['face:0'],
      origin: [bounds.min[0]! - 1, center[1]!, center[2]!],
      direction: [1, 0, 0],
      maxDistance: bounds.max[0]! - bounds.min[0]! + 2,
    });
    expect(ray).toHaveProperty('ray_test');

    const grid = await measure({
      kind: 'ray_grid',
      entityIds: ['face:0'],
      direction: [0, 0, 1],
      spacing: 1000,
    });
    expect(grid).toHaveProperty('ray_test_grid.statistics.total_rays');

    await expect(
      measure({
        kind: 'ray_grid',
        entityIds: ['face:0'],
        direction: [0, 0, 1],
        spacing: 0.5,
        maxRays: 100,
      }),
    ).rejects.toThrow(/max_rays=100/);
    const refined = (await measure({
      kind: 'ray_grid',
      entityIds: ['face:0'],
      direction: [0, 0, 1],
      spacing: 0.5,
      maxRays: 400,
    })) as unknown as {
      ray_test_grid: {
        statistics: { total_rays: number; max_rays: number; requested_spacing: number };
      };
    };
    expect(refined.ray_test_grid.statistics.max_rays).toBe(400);
    expect(refined.ray_test_grid.statistics.requested_spacing).toBe(0.5);
    expect(refined.ray_test_grid.statistics.total_rays).toBeLessThanOrEqual(400);

    const points = await measure({
      kind: 'point_analysis',
      entityIds: ['face:0'],
      points: [center],
      checks: ['contains_body', 'classify_face', 'closest_face_point', 'surface_curvature'],
    });
    expect(points.point_analysis).toHaveLength(1);

    const section = await measure({
      kind: 'section',
      entityIds: ['body:0'],
      planeOrigin: center,
      planeNormal: [1, 0, 0],
    });
    expect(section).toHaveProperty('section_by_plane.edge_count');

    const continuity = await measure({ kind: 'continuity', entityIds: ['edge:0'] });
    expect(continuity).toHaveProperty('continuity');
  }, 120_000);

  it('uses declared inch units for STEP sampling coordinates and distances', async () => {
    const inchPath = fileURLToPath(
      new URL('./fixtures/repeated-instances-inch.step', import.meta.url),
    );
    const opened = await client!.request('open', { path: inchPath, systemLengthUnit: 25.4 });
    const inchModelId = opened.result.modelId;
    try {
      const inchInspect = await client!.request('inspect', { modelId: inchModelId });
      const bounds = inchInspect.result.bounds;
      expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(30, 4);
      expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(10, 4);
      expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(10, 4);

      const sampled = await client!.request('measureGeometry', {
        modelId: inchModelId,
        kind: 'ray_grid',
        entityIds: ['face:0'],
        direction: [1, 0, 0],
        spacing: 0.5,
      });
      const sampledPayload = sampled.result as unknown as {
        results: { results: { ray_test_grid: { statistics: unknown } } }[];
      };
      const stats = sampledPayload.results[0]!.results.ray_test_grid.statistics as {
        requested_spacing: number;
        grid_size: number;
      };
      expect(stats.requested_spacing).toBe(0.5);
      expect(stats.grid_size).toBe(20);

      const tooShort = await client!.request('measureGeometry', {
        modelId: inchModelId,
        kind: 'thickness',
        entityIds: ['face:0'],
        maxDistance: 9,
      });
      const tooShortPayload = tooShort.result as unknown as {
        results: { results: { thickness: { statistics: { hit_count: number } } } }[];
      };
      expect(tooShortPayload.results[0]!.results.thickness.statistics.hit_count).toBe(0);
      const sufficient = await client!.request('measureGeometry', {
        modelId: inchModelId,
        kind: 'thickness',
        entityIds: ['face:0'],
        maxDistance: 10.1,
      });
      const sufficientPayload = sufficient.result as unknown as {
        results: { results: { thickness: { statistics: { min_distance: number } } } }[];
      };
      expect(sufficientPayload.results[0]!.results.thickness.statistics.min_distance).toBeCloseTo(
        10,
        8,
      );
    } finally {
      await client!.request('close', { modelId: inchModelId });
    }
  }, 120_000);
});
