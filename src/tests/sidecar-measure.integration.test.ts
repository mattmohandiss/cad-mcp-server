import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SidecarClient } from '../sidecar/client.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const stepPath = process.env['CAD_MCP_TEST_STEP'];
const enabled = Boolean(executable && stepPath && existsSync(executable) && existsSync(stepPath));

describe.skipIf(!enabled)('native sidecar measurement integration', () => {
  let client: SidecarClient | undefined;
  let modelId: number | undefined;
  let inspect: Record<string, any>;

  beforeAll(async () => {
    client = new SidecarClient({ executable: executable! });
    const opened = await client.request<{ modelId: number }>('open', { path: stepPath }, 600_000);
    modelId = opened.result.modelId;
    inspect = (await client.request<Record<string, any>>('inspect', { modelId })).result;
  }, 600_000);

  afterAll(async () => {
    if (client?.isAlive) {
      if (modelId !== undefined) await client.request('close', { modelId });
      await client.stop();
    }
  });

  const measure = async (args: Record<string, unknown>) =>
    (
      await client!.request<{ results: Array<{ results: Record<string, any> }> }>(
        'measureGeometry',
        { modelId, ...args },
      )
    ).result.results[0]!.results;

  it('returns results for thickness, draft, rays, points, sections and continuity', async () => {
    const bounds = inspect.bounds as { min: number[]; max: number[] };
    const center = bounds.min.map((v, i) => (v + bounds.max[i]!) / 2);
    const thickness = await measure({
      kind: 'thickness',
      entityIds: ['face:0'],
      directionMode: 'inward_normal',
      spacingMm: 1000,
    });
    expect(thickness).toHaveProperty('thickness.statistics.total_rays');

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
      spacingMm: 1000,
    });
    expect(grid).toHaveProperty('ray_test_grid.statistics.total_rays');

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
});
