import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';
import type { ExtractedFaceEntity } from '../kernel/query-entities.js';
import { withStepModel } from '../model-store.js';
import { normalizeVector, angleDegreesNormalized } from '../utils/vectors.js';
import { createPagination, createQueryResponse } from './shared.js';
import { resolveRayHits } from '../kernel/ray-utils.js';

export interface QueryFeaturesInput {
  min_diameter_mm?: number;
  max_diameter_mm?: number;
  axis_tolerance_deg?: number;
  merge_coaxial_tolerance_mm?: number;
  return_type?: 'summary' | 'entities';
  limit?: number;
  offset?: number;
}

interface CoaxialGroup {
  id: string;
  diameter_mm: number;
  axis: { direction: [number, number, number]; location: [number, number, number] };
  extent_along_axis_mm: number;
  face_ids: string[];
  ray_hits_pos_axis: Array<{ face_id: string; distance: number; point: [number, number, number] }>;
  ray_hits_neg_axis: Array<{ face_id: string; distance: number; point: [number, number, number] }>;
}

/**
 * Group coaxial cylindrical faces. No classification — surfaces measured
 * geometry so the LLM can interpret feature candidates.
 */
export async function findCoaxialCylinders(filePath: string, input: QueryFeaturesInput) {
  return withStepModel(filePath, async (model) => {
    const allFaces = await model.getFaceEntities();
    const { kernel, shape } = await model.getShapeContext('find_coaxial_cylinders');

    const axisTol = input.axis_tolerance_deg ?? 5;
    const mergeTol = input.merge_coaxial_tolerance_mm ?? 0.1;

    // Filter to cylindrical faces with axis data.
    let cylindricalFaces = allFaces.filter(
      (f) => f.surface_type === 'cylinder' && f.axis !== undefined,
    );
    if (input.min_diameter_mm !== undefined) {
      cylindricalFaces = cylindricalFaces.filter(
        (f) => f.radius !== undefined && f.radius * 2 >= input.min_diameter_mm!,
      );
    }
    if (input.max_diameter_mm !== undefined) {
      cylindricalFaces = cylindricalFaces.filter(
        (f) => f.radius !== undefined && f.radius * 2 <= input.max_diameter_mm!,
      );
    }

    // Group by coaxiality.
    const groups: {
      axisDir: [number, number, number];
      axisLoc: [number, number, number];
      radius: number;
      faces: ExtractedFaceEntity[];
    }[] = [];

    for (const face of cylindricalFaces) {
      if (!face.axis || face.radius === undefined) continue;
      const dir = normalizeVector(face.axis.direction);
      const loc = face.axis.location.slice(0, 3) as [number, number, number];

      let matched = false;
      for (const group of groups) {
        const ang = angleDegreesNormalized(dir, group.axisDir);
        if (Math.min(ang, 180 - ang) >= axisTol) continue;

        // Check axis collinearity.
        const toLoc = [
          loc[0] - group.axisLoc[0],
          loc[1] - group.axisLoc[1],
          loc[2] - group.axisLoc[2],
        ];
        const projLen = Math.abs(
          toLoc[0] * group.axisDir[0] + toLoc[1] * group.axisDir[1] + toLoc[2] * group.axisDir[2],
        );
        const perp = Math.sqrt(
          (toLoc[0] - projLen * group.axisDir[0]) ** 2 +
            (toLoc[1] - projLen * group.axisDir[1]) ** 2 +
            (toLoc[2] - projLen * group.axisDir[2]) ** 2,
        );
        if (perp < mergeTol) {
          group.faces.push(face);
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups.push({ axisDir: dir, axisLoc: loc, radius: face.radius, faces: [face] });
      }
    }

    // Measure each group.
    const result: CoaxialGroup[] = [];

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];

      // Find extent along axis using bbox centers.
      let minProj = Infinity;
      let maxProj = -Infinity;
      for (const f of group.faces) {
        const c = f.bbox_center;
        const proj =
          (c[0] - group.axisLoc[0]) * group.axisDir[0] +
          (c[1] - group.axisLoc[1]) * group.axisDir[1] +
          (c[2] - group.axisLoc[2]) * group.axisDir[2];
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
      }

      // Ray intersection in both axis directions.
      let hitsPos: Array<{ face_id: string; distance: number; point: [number, number, number] }> =
        [];
      let hitsNeg: Array<{ face_id: string; distance: number; point: [number, number, number] }> =
        [];
      try {
        const ext = Math.abs(maxProj - minProj) * 2;
        const posOrigin: Vec3 = {
          x: group.axisLoc[0] + group.axisDir[0] * (maxProj + ext * 0.5),
          y: group.axisLoc[1] + group.axisDir[1] * (maxProj + ext * 0.5),
          z: group.axisLoc[2] + group.axisDir[2] * (maxProj + ext * 0.5),
        };
        const negOrigin: Vec3 = {
          x: group.axisLoc[0] + group.axisDir[0] * (minProj - ext * 0.5),
          y: group.axisLoc[1] + group.axisDir[1] * (minProj - ext * 0.5),
          z: group.axisLoc[2] + group.axisDir[2] * (minProj - ext * 0.5),
        };
        const negDir: Vec3 = { x: -group.axisDir[0], y: -group.axisDir[1], z: -group.axisDir[2] };
        const posDir: Vec3 = { x: group.axisDir[0], y: group.axisDir[1], z: group.axisDir[2] };

        hitsPos = resolveRayHits(kernel, shape, kernel.rayIntersect(shape, posOrigin, negDir));
        hitsNeg = resolveRayHits(kernel, shape, kernel.rayIntersect(shape, negOrigin, posDir));
      } catch {
        // Ray intersection failed; leave arrays empty.
      }

      result.push({
        id: `cyl:${gi}`,
        diameter_mm: group.radius * 2,
        axis: { direction: group.axisDir, location: group.axisLoc },
        extent_along_axis_mm: maxProj - minProj,
        face_ids: group.faces.map((f) => f.id),
        ray_hits_pos_axis: hitsPos,
        ray_hits_neg_axis: hitsNeg,
      });
    }

    // Sort by diameter descending.
    result.sort((a, b) => b.diameter_mm - a.diameter_mm);

    const resultMode = input.return_type ?? 'entities';
    const total = result.length;
    const lim = input.limit ?? 100;
    const off = input.offset ?? 0;
    const paginated = resultMode === 'entities' ? result.slice(off, off + lim) : [];
    const pagination = createPagination(lim, off, paginated.length, total);

    return createQueryResponse(
      filePath,
      { ...input, return_type: resultMode, limit: lim, offset: off },
      pagination,
      paginated as never,
      { total_cylindrical_faces: cylindricalFaces.length, total_groups: total },
      [],
      [],
      [
        'Cylindrical groups are derived from B-rep geometry, not CAD feature history. Threads and non-cylindrical openings are not grouped.',
      ],
    );
  });
}
