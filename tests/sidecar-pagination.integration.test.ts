import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SidecarClient } from '../src/sidecar/client.js';
import { readStepLengthUnit } from '../src/domain/step-units.js';
import type { SidecarEntity } from '../src/sidecar/operations.js';

/**
 * Filtered paging, which is the part of `findEntities` that must not drift.
 *
 * A face outside the requested page is now counted without reading its properties, because
 * a bounding box and an area integral are the expensive part of the loop and a page needs
 * at most `limit` of them. The risk that buys is ordering: a page must still be the same
 * slice of the same filtered sequence that a single unpaged call would return.
 *
 * The filter is deliberately one that matches some faces and not others, and the walk is
 * one face per page, so every boundary is crossed with the filter active.
 */
const executable = process.env['CAD_MCP_SIDECAR'];
const launcher = process.env['CAD_MCP_SIDECAR_LAUNCHER'];
const enabled = Boolean(executable && existsSync(executable));

describe.skipIf(!enabled)('sidecar pagination under a filter', () => {
  let client: SidecarClient | undefined;
  let modelId: number | undefined;

  beforeAll(async () => {
    client = new SidecarClient({ executable: executable!, ...(launcher ? { launcher } : {}) });
    const path = fileURLToPath(new URL('./fixtures/curved-sector.step', import.meta.url));
    const units = await readStepLengthUnit(path);
    modelId = (await client.request('open', { path, systemLengthUnit: units.mmPerUnit }, 600_000))
      .result.modelId;
  }, 600_000);

  afterAll(async () => {
    if (client?.isAlive) {
      if (modelId !== undefined) await client.request('close', { modelId });
      await client.stop();
    }
  });

  const page = async (
    filter: Record<string, unknown>,
    limit: number,
    offset: number,
  ): Promise<{ entities: SidecarEntity[]; total_matched: number }> =>
    (
      await client!.request(
        'findEntities',
        { modelId: modelId!, entityType: 'face', limit, offset, filters: filter },
        60_000,
      )
    ).result;

  it('returns the same sequence whether the filtered query is paged or not', async () => {
    const whole = await page({ surface_type: 'plane' }, 1000, 0);
    // The fixture has to both match and not match, or the test proves nothing.
    expect(whole.total_matched).toBeGreaterThan(1);
    expect(whole.total_matched).toBeLessThan(5);

    const walked: string[] = [];
    for (let offset = 0; offset < whole.total_matched; offset += 1) {
      const one = await page({ surface_type: 'plane' }, 1, offset);
      expect(one.total_matched).toBe(whole.total_matched);
      expect(one.entities).toHaveLength(1);
      walked.push(...one.entities.map((face) => face.id));
    }
    expect(walked).toEqual(whole.entities.map((face) => face.id));
  });

  it('counts the whole match set even when the page is one face', async () => {
    const unfiltered = await page({}, 1, 0);
    const filtered = await page({ surface_type: 'plane' }, 1, 0);
    // `total_matched` describes the query, not the page: a one-face page still reports how
    // many faces the filter matched, which is what a caller pages against.
    expect(unfiltered.total_matched).toBe(5);
    expect(filtered.total_matched).toBeLessThan(unfiltered.total_matched);
  });

  it('pages past the end without inventing faces', async () => {
    const beyond = await page({ surface_type: 'plane' }, 10, 1000);
    expect(beyond.entities).toEqual([]);
    expect(beyond.total_matched).toBeGreaterThan(0);
  });
});
