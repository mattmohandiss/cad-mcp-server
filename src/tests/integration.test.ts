import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  handleCompareStepFiles,
  handleFindStepEdges,
  handleFindStepFaces,
  handleGetStepEntities,
  handleInspectStepFile,
} from '../tools/step-tools.js';
import { generateStep, NIST_FILE } from './fixtures.js';

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

let blockStepFile: string;
let cylinderStepFile: string;
let multiBodyStepFile: string;

describe('CAD MCP factual integration smoke tests', () => {
  beforeAll(async () => {
    blockStepFile = await generateStep((kernel) => kernel.exportStep(kernel.makeBox(10, 20, 30)));
    cylinderStepFile = await generateStep((kernel) =>
      kernel.exportStep(kernel.makeCylinder(5, 20))
    );
    multiBodyStepFile = await generateStep((kernel) => {
      const a = kernel.makeBox(10, 10, 10);
      const b = kernel.translate(kernel.makeBox(10, 10, 10), 20, 0, 0);
      return kernel.exportStep(kernel.makeCompound([a, b]));
    });
  });

  it('returns structured tool errors for missing and invalid STEP files', async () => {
    const missing = expectFailure(await handleInspectStepFile('/nonexistent/file.step'));
    expect(missing.error.type).toBe('file_not_found');

    const dummyPath = path.join(process.cwd(), 'samples', 'dummy.step');
    const invalid = expectFailure(await handleInspectStepFile(dummyPath));
    expect(invalid.error.type).toBe('invalid_format');
  });

  it('inspects generated block and multibody STEP files', async () => {
    const block = expectSuccess(await handleInspectStepFile(blockStepFile));
    expect(block.data.schema_version).toBe('0.4');
    const blockSize = block.data.size as Record<string, unknown>;
    const dimensions = blockSize.dimensions as Record<string, number>;

    expect(dimensions.width).toBeCloseTo(10, 6);
    expect(dimensions.height).toBeCloseTo(20, 6);
    expect(dimensions.depth).toBeCloseTo(30, 6);
    expect((block.data.structure as Record<string, unknown>).body_count).toBe(1);

    const multi = expectSuccess(await handleInspectStepFile(multiBodyStepFile));
    expect((multi.data.structure as Record<string, unknown>).body_count).toBe(2);
  });

  it('finds faces with flat filters, projections, grouping, and summary mode', async () => {
    const entitiesResult = expectSuccess(
      await handleFindStepFaces(blockStepFile, {
        surface_types: ['plane'],
        fields: ['id', 'surface_type', 'bbox_center', 'adjacent_faces', 'has_inner_wires'],
        limit: 10,
      })
    );
    const entitiesData = entitiesResult.data;
    expect(entitiesData.schema_version).toBe('0.4');
    const faces = entitiesData.entities as Array<Record<string, unknown>>;
    expect(faces.length).toBe(6);
    expect(faces[0].surface_type).toBe('plane');
    expect(faces[0].bbox_center).toBeDefined();
    expect(faces[0].center).toBeUndefined();
    expect(faces[0].has_inner_wires).toBe(false);
    const adjacent = faces[0].adjacent_faces as Array<Record<string, unknown>>;
    expect(adjacent.length).toBe(4);
    expect(adjacent[0].vexity).toBeUndefined();
    expect(adjacent[0].dihedral_angle_deg).toBeTypeOf('number');

    const groupsResult = expectSuccess(
      await handleFindStepFaces(blockStepFile, {
        return_type: 'groups',
        group_by: ['surface_type'],
      })
    );
    const groups = groupsResult.data.groups as Array<Record<string, unknown>>;
    expect((groupsResult.data.entities as unknown[]).length).toBe(0);
    expect(groups[0].entity_count).toBe(6);

    const summaryResult = expectSuccess(
      await handleFindStepFaces(blockStepFile, { return_type: 'summary' })
    );
    expect((summaryResult.data.entities as unknown[]).length).toBe(0);
    expect((summaryResult.data.statistics as Record<string, unknown>).total_faces).toBe(6);
  });

  it('finds edges with flat filters, projections, grouping, and sorting', async () => {
    const entitiesResult = expectSuccess(
      await handleFindStepEdges(blockStepFile, {
        curve_types: ['line'],
        fields: ['id', 'curve_type', 'length', 'bbox_center', 'adjacent_faces'],
        sort_by: 'length',
        sort_direction: 'asc',
        limit: 12,
      })
    );
    expect(entitiesResult.data.schema_version).toBe('0.4');
    const edges = entitiesResult.data.entities as Array<Record<string, unknown>>;
    expect(edges.length).toBe(12);
    expect(edges[0].curve_type).toBe('line');
    expect(edges[0].bbox_center).toBeDefined();
    expect(edges[0].center).toBeUndefined();
    expect((edges[0].adjacent_faces as unknown[]).length).toBe(2);

    const groupsResult = expectSuccess(
      await handleFindStepEdges(blockStepFile, {
        return_type: 'groups',
        group_by: ['length_range'],
        sample_entity_limit: 3,
      })
    );
    const groups = groupsResult.data.groups as Array<Record<string, unknown>>;
    expect(groups.length).toBeGreaterThan(0);
    expect((groups[0].sample_entity_ids as string[]).length).toBeLessThanOrEqual(3);
  });

  it('gets exact known STEP entities by ID', async () => {
    const found = expectSuccess(
      await handleFindStepFaces(blockStepFile, { fields: ['id'], limit: 1 })
    );
    const firstFace = (found.data.entities as Array<Record<string, unknown>>)[0];

    const result = expectSuccess(
      await handleGetStepEntities(blockStepFile, {
        entity_type: 'face',
        entity_ids: [firstFace.id as string],
        fields: ['id', 'area', 'bbox_center'],
      })
    );
    expect(result.data.schema_version).toBe('0.4');
    const entities = result.data.entities as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe(firstFace.id);
    expect(entities[0].area).toBeTypeOf('number');
    expect(entities[0].bbox_center).toBeDefined();
  });

  it('compares generated STEP files with factual metric deltas only', async () => {
    const result = expectSuccess(await handleCompareStepFiles(blockStepFile, cylinderStepFile));
    expect(result.data.schema_version).toBe('0.4');
    const deltas = result.data.deltas as Record<string, unknown>;
    expect(deltas.volume).toBeTypeOf('number');
    expect(deltas.inferenceCount).toBeUndefined();
  });

  it('imports a real NIST AP203 geometry file without crashing', async () => {
    const result = expectSuccess(await handleInspectStepFile(NIST_FILE));
    expect((result.data.structure as Record<string, unknown>).body_count).toBeGreaterThan(0);
    expect((result.data.size as Record<string, unknown>).volume).toBeGreaterThan(0);
  });
});
