import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleAnalyzeStepDetail } from '../tools/analyze-detail.js';
import { handleCompareStepFiles } from '../tools/compare.js';
import { handleGenerateStepReport } from '../tools/report.js';
import { handleInspectStepFile } from '../tools/inspect.js';
import { handleQueryStepGraph } from '../tools/query-graph.js';
import { generateStep, NIST_FILE } from './fixtures.js';

interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
}

interface ToolFailure {
  ok: false;
  error: { type: string; message: string };
}

type ToolResponse = ToolSuccess | ToolFailure;

function asToolResponse(value: unknown): ToolResponse {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as ToolResponse;
}

function expectSuccess(value: unknown): ToolSuccess {
  const response = asToolResponse(value);
  expect(response.ok).toBe(true);
  return response as ToolSuccess;
}

function expectFailure(value: unknown): ToolFailure {
  const response = asToolResponse(value);
  expect(response.ok).toBe(false);
  return response as ToolFailure;
}

let blockStepFile: string;
let cylinderStepFile: string;
let blockHoleStepFile: string;
let multiBodyStepFile: string;

beforeAll(async () => {
  blockStepFile = await generateStep((k) => k.exportStep(k.makeBox(10, 20, 30)));
  cylinderStepFile = await generateStep((k) => k.exportStep(k.makeCylinder(5, 20)));
  blockHoleStepFile = await generateStep((k) => {
    const box = k.makeBox(30, 20, 10);
    const hole = k.translate(k.makeCylinder(4, 20), 15, 10, 0);
    return k.exportStep(k.cut(box, hole));
  });
  multiBodyStepFile = await generateStep((k) => {
    const a = k.makeBox(10, 10, 10);
    const b = k.translate(k.makeBox(10, 10, 10), 20, 0, 0);
    return k.exportStep(k.makeCompound([a, b]));
  });
});

describe('CAD MCP five-tool surface', () => {
  it('returns a structured missing-file error', async () => {
    const result = expectFailure(await handleInspectStepFile('/nonexistent/file.step'));
    expect(result.error.type).toBe('file_not_found');
    expect(result.error.message).toContain('File not found');
  });

  it('rejects the metadata-only dummy STEP file without fake geometry', async () => {
    const dummyPath = path.join(process.cwd(), 'samples', 'dummy.step');
    const result = expectFailure(await handleInspectStepFile(dummyPath));
    expect(result.error.type).toBe('invalid_format');
    expect(result.error.message).toContain('STEP import failed');
  });

  it('inspects a known block with providers and AAG summary', async () => {
    const result = expectSuccess(await handleInspectStepFile(blockStepFile));
    const facts = result.data.facts as Record<string, Record<string, unknown>>;
    const geometry = facts.geometry as Record<string, unknown>;
    const dimensions = geometry.dimensions as Record<string, number>;

    expect(dimensions.width).toBeCloseTo(10, 6);
    expect(dimensions.height).toBeCloseTo(20, 6);
    expect(dimensions.depth).toBeCloseTo(30, 6);
    expect(geometry.volume).toBeCloseTo(6000, 6);
    expect(geometry.surfaceArea).toBeCloseTo(2200, 6);
    expect(geometry.bodyCount).toBe(1);

    const aag = geometry.aag as Record<string, unknown>;
    expect(aag.faceCount).toBe(6);
    expect(aag.adjacencyCount).toBe(12);

    const providers = result.data.providers as { providers: unknown[] };
    expect(providers.providers.length).toBe(3);

    const exchange = facts.exchange as Record<string, unknown>;
    expect(exchange.productCount).toBe(1);
  });

  it('analyzes selected detail categories with AAG and semantic data', async () => {
    const result = expectSuccess(
      await handleAnalyzeStepDetail(blockStepFile, ['geometry', 'topology', 'health'], 'full')
    );
    expect(Array.isArray(result.data.facts)).toBe(true);
    expect(Array.isArray(result.data.nodes)).toBe(true);
    expect(Array.isArray(result.data.warnings)).toBe(true);

    const topologyFacts = (result.data.facts as Array<{ category: string }>).filter(
      (f) => f.category === 'topology'
    );
    expect(topologyFacts.length).toBeGreaterThanOrEqual(2);
  });

  it('queries AAG face adjacency from a simple block', async () => {
    const result = expectSuccess(
      await handleQueryStepGraph(blockStepFile, {
        find: 'nodes',
        type: 'face',
      })
    );
    const results = result.data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(6);
  });

  it('queries adjacency edges from AAG', async () => {
    const result = expectSuccess(
      await handleQueryStepGraph(blockStepFile, {
        find: 'edges',
        type: 'adjacent',
      })
    );
    const results = result.data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(12);
    for (const edge of results) {
      expect(edge.type).toBe('adjacent');
    }
  });

  it('queries feature candidates from a block with a through-hole', async () => {
    const result = expectSuccess(
      await handleQueryStepGraph(blockHoleStepFile, {
        find: 'features',
      })
    );
    const results = result.data.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    const holeFeature = results.find((r) => String(r.type).includes('hole'));
    expect(holeFeature).toBeDefined();
  });

  it('compares two files with metric deltas', async () => {
    const result = expectSuccess(await handleCompareStepFiles(blockStepFile, cylinderStepFile));
    const deltas = result.data.deltas as Record<string, unknown>;
    expect(deltas.volume).toBeTypeOf('number');
    expect(deltas.bodyCount).toBe(0);
  });

  it('generates JSON plus Markdown report', async () => {
    const result = expectSuccess(
      await handleGenerateStepReport(blockStepFile, 'engineering_review')
    );
    expect(result.data.sections).toBeTypeOf('object');
    expect(result.data.markdown).toContain('# STEP engineering review Report');
  });

  it('handles multibody geometry in inspect output', async () => {
    const result = expectSuccess(await handleInspectStepFile(multiBodyStepFile));
    const facts = result.data.facts as Record<string, Record<string, unknown>>;
    const geometry = facts.geometry as Record<string, unknown>;
    expect(geometry.bodyCount).toBe(2);
  });

  it('imports a real NIST AP203 geometry file without crashing', async () => {
    const result = expectSuccess(await handleInspectStepFile(NIST_FILE));
    const facts = result.data.facts as Record<string, Record<string, unknown>>;
    const geometry = facts.geometry as Record<string, unknown>;
    expect(Number(geometry.bodyCount)).toBeGreaterThan(0);
    expect(Number(geometry.volume)).toBeGreaterThan(0);
    const aag = geometry.aag as Record<string, unknown>;
    expect(aag.faceCount).toBeGreaterThan(0);
    expect(aag.adjacencyCount).toBeGreaterThan(0);
  });
});
