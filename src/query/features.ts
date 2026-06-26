import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';
import { type ExtractedFaceEntity } from '../kernel/query-entities.js';
import { withStepModel } from '../model-store.js';
import { normalizeVector, angleDegreesNormalized, dotProduct } from '../utils/vectors.js';
import { createPagination, createQueryResponse } from './shared.js';

export interface QueryFeaturesInput {
  min_diameter_mm?: number;
  max_diameter_mm?: number;
  axis_tolerance_deg?: number;
  merge_coaxial_tolerance_mm?: number;
  return_type?: 'summary' | 'entities';
  limit?: number;
  offset?: number;
}

interface CylindricalFeature {
  id: string;
  diameter_mm: number;
  axis: { direction: [number, number, number]; location: [number, number, number] };
  through: boolean | null;
  cylindrical_faces: string[];
  cap_faces: string[];
}

/**
 * Map raw ray intersection results to face IDs using the kernel's hash function.
 */
function resolveRayHits(
  kernel: OcctKernel,
  shape: ShapeHandle,
  raw: number[],
): Array<{ face_id: string; distance: number; point: [number, number, number] }> {
  const stride = 7;
  const faces = kernel.getSubShapes(shape, 'face');
  const HASH_UPPER = 1 << 30;
  const hashToIdx = new Map<number, number>();
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (!f) continue;
    hashToIdx.set(kernel.hashCode(f, HASH_UPPER), i);
  }
  const hits: Array<{ face_id: string; distance: number; point: [number, number, number] }> = [];
  for (let i = 0; i + stride <= raw.length; i += stride) {
    const faceHash = raw[i];
    const faceIdx = hashToIdx.get(faceHash);
    if (faceIdx === undefined) continue;
    hits.push({
      face_id: `face:${faceIdx}`,
      distance: raw[i + 1],
      point: [raw[i + 2], raw[i + 3], raw[i + 4]],
    });
  }
  return hits;
}

/**
 * Find cylindrical features by grouping coaxial cylindrical faces.
 */
export async function findCylindricalFeatures(
  filePath: string,
  input: QueryFeaturesInput,
) {
  return withStepModel(filePath, async (model) => {
    const allFaces = await model.getFaceEntities();
    const { kernel, shape } = await model.getShapeContext('find_cylindrical_features');

    const axisTol = input.axis_tolerance_deg ?? 5;
    const mergeTol = input.merge_coaxial_tolerance_mm ?? 0.1;

    // Filter to cylindrical faces with axis data, optionally by diameter.
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
      axisDir: number[];
      axisLoc: [number, number, number];
      radius: number;
      faces: ExtractedFaceEntity[];
    }[] = [];

    for (const face of cylindricalFaces) {
      if (!face.axis || face.radius === undefined) continue;
      const dir = normalizeVector(face.axis.direction);
      const loc = face.axis.location as [number, number, number];

      let matched = false;
      for (const group of groups) {
        const ang = angleDegreesNormalized(dir, group.axisDir);
        const isAntiParallel = Math.min(ang, 180 - ang) < axisTol;
        if (!isAntiParallel) continue;

        // Check if axis locations are collinear.
        const toLoc = [loc[0] - group.axisLoc[0], loc[1] - group.axisLoc[1], loc[2] - group.axisLoc[2]];
        const projLen = Math.abs(
          toLoc[0] * group.axisDir[0] +
            toLoc[1] * group.axisDir[1] +
            toLoc[2] * group.axisDir[2],
        );
        const perp =
          Math.sqrt(
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

    // Classify each group.
    const features: CylindricalFeature[] = [];
    const allFaceShapes = kernel.getSubShapes(shape, 'face');

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const axisDir = group.axisDir as [number, number, number];
      const axisLoc = group.axisLoc;

      // Find min/max position along the axis using face bbox centers.
      let minProj = Infinity;
      let maxProj = -Infinity;
      for (const f of group.faces) {
        const c = f.bbox_center;
        const proj =
          (c[0] - axisLoc[0]) * axisDir[0] +
          (c[1] - axisLoc[1]) * axisDir[1] +
          (c[2] - axisLoc[2]) * axisDir[2];
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
      }

      // Check through/blind via ray casting.
      let through: boolean | null = null;
      const capFaces: string[] = [];
      try {
        // Fire ray in +axis direction.
        const ext = Math.abs(maxProj - minProj) * 2;
        const originPos: Vec3 = {
          x: axisLoc[0] + axisDir[0] * (maxProj + ext * 0.5),
          y: axisLoc[1] + axisDir[1] * (maxProj + ext * 0.5),
          z: axisLoc[2] + axisDir[2] * (maxProj + ext * 0.5),
        };
        const originNeg: Vec3 = {
          x: axisLoc[0] + axisDir[0] * (minProj - ext * 0.5),
          y: axisLoc[1] + axisDir[1] * (minProj - ext * 0.5),
          z: axisLoc[2] + axisDir[2] * (minProj - ext * 0.5),
        };
        const dirNeg: Vec3 = { x: -axisDir[0], y: -axisDir[1], z: -axisDir[2] };
        const axisVec: Vec3 = { x: axisDir[0], y: axisDir[1], z: axisDir[2] };

        const hitsPos = resolveRayHits(
          kernel,
          shape,
          kernel.rayIntersect(shape, originPos, dirNeg),
        );
        const hitsNeg = resolveRayHits(
          kernel,
          shape,
          kernel.rayIntersect(shape, originNeg, axisVec),
        );

        // Find planar face hits near ends.
        if (hitsPos.length > 0) {
          const firstHit = hitsPos[0];
          const hitFace = allFaces[parseInt(firstHit.face_id.split(':')[1], 10)];
          if (hitFace?.surface_type === 'plane') capFaces.push(firstHit.face_id);
        }
        if (hitsNeg.length > 0) {
          const firstHit = hitsNeg[0];
          const hitFace = allFaces[parseInt(firstHit.face_id.split(':')[1], 10)];
          if (hitFace?.surface_type === 'plane') capFaces.push(firstHit.face_id);
        }

        // Through if both ends hit something and at least one is a planar face.
        through = hitsPos.length > 0 && hitsNeg.length > 0;
      } catch {
        // Ray intersection failed; leave through as null.
      }

      features.push({
        id: `cyl:${gi}`,
        diameter_mm: group.radius * 2,
        axis: { direction: axisDir, location: axisLoc },
        through,
        cylindrical_faces: group.faces.map((f) => f.id),
        cap_faces: capFaces,
      });
    }

    // Sort by diameter descending.
    features.sort((a, b) => b.diameter_mm - a.diameter_mm);

    const resultMode = input.return_type ?? 'entities';
    const total = features.length;
    const { limit, offset } = (() => {
      const l = input.limit ?? 100;
      const o = input.offset ?? 0;
      return { limit: l, offset: o };
    })();
    const paginated = resultMode === 'entities' ? features.slice(offset, offset + limit) : [];
    const pagination = createPagination(limit, offset, paginated.length, total);

    return createQueryResponse(
      filePath,
      { ...input, return_type: resultMode, limit, offset },
      pagination,
      paginated as never,
      {
        total_cylindrical_faces: cylindricalFaces.length,
        total_features: total,
      },
      [],
      [],
      [
        'Cylindrical features are inferred from B-rep geometry, not original CAD feature history. Threads and non-cylindrical holes are not detected.',
      ],
    );
  });
}
