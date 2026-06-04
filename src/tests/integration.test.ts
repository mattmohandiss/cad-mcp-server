import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { OcctKernel } from 'occt-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleAnalyzeStepFile } from '../tools/analyze.js';
import { handleListBodies } from '../tools/bodies.js';
import { handleExtractEdges } from '../tools/edges.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateStep(gen: (kernel: OcctKernel) => string): Promise<string> {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'cad-mcp-'));
  const stepFile = path.join(fixtureDir, `fixture_${Math.random().toString(36).slice(2, 8)}.step`);
  const kernel = await OcctKernel.init();
  const stepData = gen(kernel);
  kernel[Symbol.dispose]?.();
  await writeFile(stepFile, stepData, 'utf8');
  return stepFile;
}

interface ToolResponse {
  success?: boolean;
  // Tool handlers intentionally return dynamic JSON payloads in tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  error?: string;
  type?: string;
}

function asToolResponse(value: unknown): ToolResponse {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as ToolResponse;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NIST_FILE = path.join(
  process.cwd(),
  'samples',
  'NIST-PMI-STEP-Files',
  'AP203 geometry only',
  'nist_ftc_11_asme1_rb.stp'
);

let blockStepFile: string;
let cylinderStepFile: string;
let blockHoleStepFile: string;
let multiBodyStepFile: string;

beforeAll(async () => {
  blockStepFile = await generateStep((k) => k.exportStep(k.makeBox(10, 20, 30)));

  cylinderStepFile = await generateStep((k) => k.exportStep(k.makeCylinder(5, 20)));

  blockHoleStepFile = await generateStep((k) => {
    const box = k.makeBox(30, 20, 10);
    // Cylinder from z=0 to z=20 (box is z=0 to z=10), fully spanning the part
    const hole = k.translate(k.makeCylinder(4, 20), 15, 10, 0);
    return k.exportStep(k.cut(box, hole));
  });

  multiBodyStepFile = await generateStep((k) => {
    const a = k.makeBox(10, 10, 10);
    const b = k.translate(k.makeBox(10, 10, 10), 20, 0, 0);
    return k.exportStep(k.makeCompound([a, b]));
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CAD MCP tool handlers', () => {
  // ── Error handling ────────────────────────────────────────────────────

  it('returns a structured missing-file error', async () => {
    const result = asToolResponse(await handleAnalyzeStepFile('/nonexistent/file.step'));
    expect(result.success).toBe(false);
    expect(result.type).toBe('file_not_found');
    expect(result.error).toContain('File not found');
  });

  it('rejects the metadata-only dummy STEP file without fake geometry', async () => {
    const path_ = path.join(process.cwd(), 'samples', 'dummy.step');
    const result = asToolResponse(await handleAnalyzeStepFile(path_));
    expect(result.success).toBe(false);
    expect(result.type).toBe('invalid_format');
    expect(result.error).toContain('STEP import failed');
  });

  // ── Analytic block (10x20x30) ─────────────────────────────────────────

  describe('analytic block', () => {
    it('analyzes with known geometry', async () => {
      const r = asToolResponse(await handleAnalyzeStepFile(blockStepFile));
      expect(r.success).toBe(true);
      expect(r.data.dimensions.width).toBeCloseTo(10, 6);
      expect(r.data.dimensions.height).toBeCloseTo(20, 6);
      expect(r.data.dimensions.depth).toBeCloseTo(30, 6);
      expect(r.data.volume).toBeCloseTo(6000, 6);
      expect(r.data.surfaceArea).toBeCloseTo(2200, 6);
      expect(r.data.bodyCount).toBe(1);
    });

    it('lists as one body with formatted values', async () => {
      const r = asToolResponse(await handleListBodies(blockStepFile));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBe(1);
      expect(r.data.bodies[0].volume).toBe('6000.00');
      expect(r.data.bodies[0].surfaceArea).toBe('2200.00');
    });

    it('extracts stable edge statistics', async () => {
      const r = asToolResponse(await handleExtractEdges(blockStepFile));
      expect(r.success).toBe(true);
      expect(r.data.totalEdgeCount).toBe(12);
      expect(r.data.statistics.minLength).toBe('10.00');
      expect(r.data.statistics.maxLength).toBe('30.00');
      expect(r.data.edgeLengthRanges.medium).toBe(4);
      expect(r.data.edgeLengthRanges.large).toBe(8);
    });
  });

  // ── Cylinder (r=5, h=20) ──────────────────────────────────────────────

  describe('analytic cylinder', () => {
    it('analyzes with expected volume and surface area', async () => {
      const r = asToolResponse(await handleAnalyzeStepFile(cylinderStepFile));
      expect(r.success).toBe(true);
      // πr²h = π * 25 * 20 = 500π ≈ 1570.80
      expect(r.data.volume).toBeCloseTo(500 * Math.PI, 1);
      // 2πr² + 2πrh = 50π + 200π = 250π ≈ 785.40
      expect(r.data.surfaceArea).toBeCloseTo(250 * Math.PI, 1);
      expect(r.data.bodyCount).toBe(1);
    });

    it('lists as one body with correct volume', async () => {
      const r = asToolResponse(await handleListBodies(cylinderStepFile));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBe(1);
      expect(r.data.bodies[0].volume).toBe((500 * Math.PI).toFixed(2));
    });
  });

  // ── Block with through-hole ───────────────────────────────────────────

  describe('block with through-hole', () => {
    it('analyzes with reduced volume from subtracted cylinder', async () => {
      const r = asToolResponse(await handleAnalyzeStepFile(blockHoleStepFile));
      expect(r.success).toBe(true);
      // Box volume 6000 minus cylinder πr²h = π*4²*10 = 160π through the part
      const expected = 6000 - 160 * Math.PI;
      expect(r.data.volume).toBeCloseTo(expected, 0);
      expect(r.data.bodyCount).toBe(1);
    });

    it('lists as one body', async () => {
      const r = asToolResponse(await handleListBodies(blockHoleStepFile));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBe(1);
    });
  });

  // ── Multi-body compound ───────────────────────────────────────────────

  describe('multi-body compound', () => {
    it('analyzes as two bodies', async () => {
      const r = asToolResponse(await handleAnalyzeStepFile(multiBodyStepFile));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBe(2);
    });

    it('lists each body with correct individual volume', async () => {
      const r = asToolResponse(await handleListBodies(multiBodyStepFile));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBe(2);
      expect(r.data.bodies[0].volume).toBe('1000.00');
      expect(r.data.bodies[1].volume).toBe('1000.00');
    });
  });

  // ── NIST regression ───────────────────────────────────────────────────

  describe('NIST regression', () => {
    it('imports a real AP203 geometry file without crashing', async () => {
      const r = asToolResponse(await handleAnalyzeStepFile(NIST_FILE));
      expect(r.success).toBe(true);
      expect(r.data.bodyCount).toBeGreaterThan(0);
      expect(r.data.volume).toBeGreaterThan(0);
    });

    it('extracts edges from a real NIST file', async () => {
      const r = asToolResponse(await handleExtractEdges(NIST_FILE));
      expect(r.success).toBe(true);
      expect(r.data.totalEdgeCount).toBeGreaterThan(0);
      expect(Number(r.data.statistics.minLength)).toBeGreaterThanOrEqual(0);
    });
  });
});
