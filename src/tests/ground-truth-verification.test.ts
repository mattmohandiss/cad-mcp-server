/**
 * Ground truth verifier: for each generated STEP file, run the OCCT-wasm
 * kernel against it and confirm the kernel's measurements match the
 * expected_answers in the meta.json.
 *
 * If the kernel's measurements disagree with the ground truth, either:
 *   (a) the cadquery generation is wrong (re-run generate.py)
 *   (b) the kernel binding is wrong (file an issue)
 *   (c) the ground truth expectation is wrong (update meta.json)
 *
 * Run with: npx vitest run src/tests/ground-truth-verification.test.ts
 * (or via the test runner in src/tests/ground-truth.test.ts)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withStepModel } from '../model-store.js';
import { handleInspectStepFile } from '../tools/step-tools.js';

const SAMPLES_DIR = path.join(process.cwd(), 'samples', 'eval-generated');

const NUMERIC_TOLERANCE = 0.01; // mm or mm^2 or mm^3
const PERCENT_TOLERANCE = 0.01; // 1% for some answers

interface MetaJson {
  file: string;
  design_intent: string;
  expected_answers: Record<string, number | boolean | string>;
  notes: string;
}

async function loadMeta(filename: string): Promise<MetaJson> {
  const metaPath = path.join(SAMPLES_DIR, `${path.parse(filename).name}.meta.json`);
  const text = await fs.readFile(metaPath, 'utf8');
  return JSON.parse(text) as MetaJson;
}

function approxEqual(a: number, b: number, tol: number): boolean {
  if (a === b) return true;
  const absDiff = Math.abs(a - b);
  if (absDiff < tol) return true;
  const relDiff = absDiff / Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return relDiff < PERCENT_TOLERANCE;
}

describe('ground truth verification (kernel vs meta.json)', () => {
  for (const filename of [
    'box.step',
    'box_with_3_holes.step',
    'box_with_blind_hole.step',
    'stepped_cylinder.step',
    'bracket_v1.step',
    'bracket_v2.step',
  ]) {
    it(`${filename}: kernel matches ground truth`, async () => {
      const meta = await loadMeta(filename);
      const filePath = path.join(SAMPLES_DIR, filename);
      const inspection = await withStepModel(filePath, async (model) => {
        const [brep, semantic] = await Promise.all([model.getBRepModel(), model.getSemanticModel()]);
        const { kernel, shape } = await model.getShapeContext('ground_truth_verify');
        const obb = kernel.getOrientedBoundingBox(shape);
        const freeEdgeCount = kernel.freeEdgeCount(shape);
        const isValid = kernel.isValid(shape);
        const faces = kernel.getSubShapes(shape, 'face');
        const edges = kernel.getSubShapes(shape, 'edge');
        const faceSurfaces = faces.map((f) => kernel.surfaceType(f));
        return { brep, semantic, faceCount: faces.length, edgeCount: edges.length, faceSurfaces, obb, freeEdgeCount, isValid };
      });

      const answers = meta.expected_answers;

      if ('face_count' in answers) {
        expect(inspection.faceCount).toBe(answers.face_count);
      }
      if ('cylindrical_face_groups' in answers) {
        const cylCount = inspection.faceSurfaces.filter((s) => s === 'cylinder').length;
        expect(cylCount).toBeGreaterThanOrEqual(answers.cylindrical_face_groups);
      }
      if ('planar_faces' in answers) {
        const planeCount = inspection.faceSurfaces.filter((s) => s === 'plane').length;
        expect(planeCount).toBeGreaterThanOrEqual(answers.planar_faces);
      }
      if ('volume_mm3' in answers) {
        expect(approxEqual(inspection.brep.volume, answers.volume_mm3 as number, NUMERIC_TOLERANCE)).toBe(true);
      }
      if ('surface_area_mm2' in answers) {
        expect(approxEqual(inspection.brep.surfaceArea, answers.surface_area_mm2 as number, NUMERIC_TOLERANCE)).toBe(true);
      }
      // Bounding-box sanity check.
      expect(inspection.brep.dimensions.width).toBeGreaterThan(0);
      expect(inspection.brep.dimensions.height).toBeGreaterThan(0);
      expect(inspection.brep.dimensions.depth).toBeGreaterThan(0);
    });
  }
});
