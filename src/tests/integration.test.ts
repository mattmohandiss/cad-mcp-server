import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  handleCompareStepFiles,
  handleFindStepEdges,
  handleFindStepFaces,
  handleGetStepEntities,
  handleInspectStepFile,
  handleQueryStepPmi,
} from '../tools/step-tools.js';
import { NIST_FILE } from './fixtures.js';

interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
}

interface ToolFailure {
  ok: false;
  error: { type: string; message: string };
}

function expectSuccess(value: unknown): ToolSuccess {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const response = value as ToolSuccess | ToolFailure;
  expect(response.ok).toBe(true);
  return response as ToolSuccess;
}

function expectFailure(value: unknown): ToolFailure {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const response = value as ToolSuccess | ToolFailure;
  expect(response.ok).toBe(false);
  return response as ToolFailure;
}

describe('CAD MCP factual integration smoke tests', () => {
  it('returns structured tool errors for missing and invalid STEP files', async () => {
    const missing = expectFailure(await handleInspectStepFile('/nonexistent/file.step'));
    expect(missing.error.type).toBe('file_not_found');

    const dummyPath = path.join(process.cwd(), 'samples', 'dummy.step');
    const invalid = expectFailure(await handleInspectStepFile(dummyPath));
    expect(invalid.error.type).toBe('invalid_format');
  });

  it('inspects a STEP file and returns size, structure, and metadata', async () => {
    const result = expectSuccess(await handleInspectStepFile(NIST_FILE));
    expect(result.data.schema_version).toBe('0.4');
    const size = result.data.size as Record<string, unknown>;
    expect(size.dimensions).toBeDefined();
    expect((size.dimensions as Record<string, number>).width).toBeGreaterThan(0);
    expect((result.data.structure as Record<string, unknown>).body_count).toBeGreaterThan(0);
  });

  it('finds faces with filters, projections, grouping, and summary mode', async () => {
    const entitiesResult = expectSuccess(
      await handleFindStepFaces(NIST_FILE, {
        surface_types: ['plane'],
        fields: ['id', 'surface_type', 'bbox_center', 'adjacent_faces', 'has_inner_wires'],
        limit: 10,
      }),
    );
    const entitiesData = entitiesResult.data;
    expect(entitiesData.schema_version).toBe('0.4');
    const faces = entitiesData.entities as Array<Record<string, unknown>>;
    expect(faces.length).toBeGreaterThan(0);
    expect(faces[0].surface_type).toBe('plane');
    expect(faces[0].bbox_center).toBeDefined();
    expect(faces[0].center).toBeUndefined();
    expect(faces[0].has_inner_wires).toBeDefined();
    const adjacent = faces[0].adjacent_faces as Array<Record<string, unknown>>;
    expect(adjacent.length).toBeGreaterThan(0);
    expect(adjacent[0].dihedral_angle_deg).toBeTypeOf('number');
    expect(adjacent[0].vexity).toBeUndefined();

    const groupsResult = expectSuccess(
      await handleFindStepFaces(NIST_FILE, {
        return_type: 'groups',
        group_by: ['surface_type'],
      }),
    );
    const groups = groupsResult.data.groups as Array<Record<string, unknown>>;
    expect((groupsResult.data.entities as unknown[]).length).toBe(0);
    expect(groups.length).toBeGreaterThan(0);

    const summaryResult = expectSuccess(
      await handleFindStepFaces(NIST_FILE, { return_type: 'summary' }),
    );
    expect((summaryResult.data.entities as unknown[]).length).toBe(0);
    expect((summaryResult.data.statistics as Record<string, unknown>).total_faces).toBeGreaterThan(
      0,
    );
  });

  it('finds edges with filters, projections, grouping, and sorting', async () => {
    const entitiesResult = expectSuccess(
      await handleFindStepEdges(NIST_FILE, {
        fields: ['id', 'curve_type', 'length', 'bbox_center', 'adjacent_faces'],
        sort: { by: 'length', direction: 'asc' },
        limit: 12,
      }),
    );
    expect(entitiesResult.data.schema_version).toBe('0.4');
    const edges = entitiesResult.data.entities as Array<Record<string, unknown>>;
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].curve_type).toBeDefined();
    expect(edges[0].bbox_center).toBeDefined();
    expect(edges[0].center).toBeUndefined();

    const groupsResult = expectSuccess(
      await handleFindStepEdges(NIST_FILE, {
        return_type: 'groups',
        group_by: ['length_range'],
      }),
    );
    const groups = groupsResult.data.groups as Array<Record<string, unknown>>;
    expect(groups.length).toBeGreaterThan(0);
    expect((groups[0].sample_entity_ids as string[]).length).toBeLessThanOrEqual(5);
  });

  it('finds circular edges and returns exact edge radius', async () => {
    const found = expectSuccess(
      await handleFindStepEdges(NIST_FILE, {
        curve_types: ['circle'],
        fields: ['id', 'curve_type', 'radius'],
        limit: 5,
      }),
    );
    const edges = found.data.entities as Array<Record<string, unknown>>;
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].curve_type).toBe('circle');
    expect(edges[0].radius).toBeTypeOf('number');
    expect((edges[0].radius as number) > 0).toBe(true);

    const exact = expectSuccess(
      await handleGetStepEntities(NIST_FILE, {
        entity_type: 'edge',
        entity_ids: [edges[0].id as string],
        fields: ['id', 'curve_type', 'radius'],
      }),
    );
    const exactEdges = exact.data.entities as Array<Record<string, unknown>>;
    expect(exactEdges[0].radius).toBeTypeOf('number');
  });

  it('gets exact known STEP entities by ID', async () => {
    const found = expectSuccess(await handleFindStepFaces(NIST_FILE, { fields: ['id'], limit: 1 }));
    const firstFace = (found.data.entities as Array<Record<string, unknown>>)[0];

    const result = expectSuccess(
      await handleGetStepEntities(NIST_FILE, {
        entity_type: 'face',
        entity_ids: [firstFace.id as string],
        fields: ['id', 'area', 'bbox_center'],
      }),
    );
    expect(result.data.schema_version).toBe('0.4');
    const entities = result.data.entities as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe(firstFace.id);
    expect(entities[0].area).toBeTypeOf('number');
    expect(entities[0].bbox_center).toBeDefined();
  });

  it('returns clean errors for out-of-range exact entity IDs', async () => {
    const result = expectFailure(
      await handleGetStepEntities(NIST_FILE, {
        entity_type: 'face',
        entity_ids: ['face:999'],
        fields: ['id', 'area'],
      }),
    );

    expect(result.error.type).toBe('invalid_input');
    expect(result.error.message).toContain('out of range');
  });

  it('compares a STEP file with itself — all deltas are zero', async () => {
    const result = expectSuccess(await handleCompareStepFiles(NIST_FILE, NIST_FILE));
    expect(result.data.schema_version).toBe('0.4');
    const deltas = result.data.deltas as Record<string, unknown>;
    expect(deltas.volume).toBe(0);
    expect(deltas.inferenceCount).toBeUndefined();
  });

  it('compares two different STEP files and reports non-zero deltas', async () => {
    const ap242File = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );

    const result = expectSuccess(await handleCompareStepFiles(NIST_FILE, ap242File));
    const deltas = result.data.deltas as Record<string, unknown>;
    const dimensions = deltas.dimensions as Record<string, number>;
    const anyNonZero =
      dimensions.width !== 0 ||
      dimensions.height !== 0 ||
      dimensions.depth !== 0 ||
      deltas.volume !== 0 ||
      deltas.surfaceArea !== 0;
    expect(anyNonZero).toBe(true);
  });

  it('omits surface_parameters for non-cylindrical faces', async () => {
    const result = expectSuccess(
      await handleFindStepFaces(NIST_FILE, {
        surface_types: ['plane'],
        fields: ['id', 'surface_type', 'surface_parameters'],
        limit: 5,
      }),
    );
    const faces = result.data.entities as Array<Record<string, unknown>>;
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face.surface_parameters).toBeUndefined();
    }
  });

  it('PMI statistics reflect filtered counts, not totals', async () => {
    const pmiFile = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );

    const all = expectSuccess(await handleQueryStepPmi(pmiFile, { return_type: 'summary' }));
    const tolerances = expectSuccess(
      await handleQueryStepPmi(pmiFile, {
        pmi_types: ['geometric_tolerance'],
        return_type: 'summary',
      }),
    );

    const allStats = all.data.statistics as Record<string, number>;
    const tolStats = tolerances.data.statistics as Record<string, number>;
    expect(tolStats.matched_pmi).toBeLessThan(allStats.total_pmi);
    expect(tolStats.geometric_tolerance).toBe(tolStats.matched_pmi);
    expect(tolStats.dimension ?? 0).toBe(0);
  });

  it('queries PMI from an AP242 STEP file', async () => {
    const pmiFile = path.join(
      process.cwd(),
      'samples',
      'NIST-PMI-STEP-Files',
      'nist_ftc_08_asme1_ap242-e2.stp',
    );

    const summary = expectSuccess(await handleQueryStepPmi(pmiFile, { return_type: 'summary' }));
    expect(summary.data.schema_version).toBe('0.4');
    expect((summary.data.statistics as Record<string, unknown>).total_pmi).toBeGreaterThan(0);

    const entities = expectSuccess(
      await handleQueryStepPmi(pmiFile, {
        pmi_types: ['geometric_tolerance'],
        limit: 5,
      }),
    );
    const items = entities.data.entities as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].type).toBe('geometric_tolerance');
  });
});
