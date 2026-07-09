import { describe, expect, it } from 'vitest';
import { dispatchMeasure } from '../query/measure.js';
import { buildHitSummary } from '../tools/measure-helpers.js';

describe('measure helpers', () => {
  it('summarizes ray grids with zero hits without NaN distances', () => {
    const summary = buildHitSummary({ ray_test_grid: { total_rays: 4, hit_distance: [] } });
    expect(summary).toEqual({ total_rays: 4, hit_count: 0, miss_count: 4 });
  });

  it('releases temporary section shapes after section_by_plane', () => {
    const released: number[] = [];
    const kernel = {
      sectionByPlane: () => 99,
      getSubShapes: () => [],
      release: (shape: number) => released.push(shape),
    };

    const result = dispatchMeasure(kernel as never, 1 as never, 2 as never, [
      { op: 'section_by_plane', plane_origin: [0, 0, 0], plane_normal: [0, 0, 1] },
    ]);

    expect(result.section_by_plane).toEqual({ edge_count: 0, edges: [] });
    expect(released).toEqual([99]);
  });
});
