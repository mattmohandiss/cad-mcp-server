import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  handleCompareStepFiles,
  handleInspectStepFile,
  handleQueryStepEdges,
  handleQueryStepFaces,
  stepToolSchemas,
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
let multiBodyStepFile: string;

beforeAll(async () => {
  blockStepFile = await generateStep((k) => k.exportStep(k.makeBox(10, 20, 30)));
  cylinderStepFile = await generateStep((k) => k.exportStep(k.makeCylinder(5, 20)));
  multiBodyStepFile = await generateStep((k) => {
    const a = k.makeBox(10, 10, 10);
    const b = k.translate(k.makeBox(10, 10, 10), 20, 0, 0);
    return k.exportStep(k.makeCompound([a, b]));
  });
});

describe('CAD MCP tool surface', () => {
  it('defines only the five public tool schemas', () => {
    expect(Object.keys(stepToolSchemas).sort()).toEqual([
      'compareStepFiles',
      'inspectStepFile',
      'queryStepEdges',
      'queryStepFaces',
      'queryStepPmi',
    ]);
  });

  it('rejects unknown top-level fields for every public schema', () => {
    const schemas = [
      z.object(stepToolSchemas.inspectStepFile).strict(),
      z.object(stepToolSchemas.queryStepFaces).strict(),
      z.object(stepToolSchemas.queryStepEdges).strict(),
    ];

    for (const schema of schemas) {
      expect(schema.safeParse({ file_path: blockStepFile, unexpected: true }).success).toBe(false);
    }

    expect(
      z
        .object(stepToolSchemas.compareStepFiles)
        .strict()
        .safeParse({ file_a: blockStepFile, file_b: cylinderStepFile, unexpected: true }).success
    ).toBe(false);
  });

  it('accepts strict multi-turn edge query controls and rejects unknown keys', () => {
    const edgeSchema = z.object(stepToolSchemas.queryStepEdges).strict();

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        filter: {
          curve_type: ['bspline'],
          length_max: 1,
          entity_ids: ['edge:1'],
          group_ids: ['group:0'],
        },
        region: { bbox: { min: [-1, -1, -1], max: [1, 1, 1] }, mode: 'intersects' },
        near: { point: [0, 0, 0], distance: 10 },
        include: ['id', 'curve_type', 'length', 'bbox'],
        group_by: ['curve_type', 'length_range'],
        sort: { by: 'length', direction: 'asc' },
        result_mode: 'groups',
        limit: 50,
        offset: 0,
        sample_entity_limit: 5,
      }).success
    ).toBe(true);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        include: ['whatever'],
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        filter: { length_max: 1, bbox_intersects: { min: [0, 0, 0], max: [1, 1, 1] } },
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        filter: { length_min: 10, length_max: 1 },
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        region: { bbox: { min: [1, 0, 0], max: [0, 1, 1] } },
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        include: ['length', 'length'],
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        include: [],
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        sample_entity_limit: 51,
      }).success
    ).toBe(false);

    // Removed controls are no longer part of the surface and must be rejected.
    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        cluster: { enabled: true, distance_tolerance: 5 },
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        max_results_policy: 'truncate_with_summary',
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        tolerances: { distance: 0.01 },
      }).success
    ).toBe(false);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        result_mode: 'entities_groups_clusters',
      }).success
    ).toBe(false);

    // Removed group_by dimensions for edges must be rejected.
    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        group_by: ['axis_direction'],
      }).success
    ).toBe(false);
  });

  it('rejects non-zero direction vectors in face normal filter', () => {
    const faceSchema = z.object(stepToolSchemas.queryStepFaces).strict();

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        filter: { normal_parallel_to: [0, 0, 0] },
      }).success
    ).toBe(false);

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        filter: { curvature_min: 0 },
      }).success
    ).toBe(false);
  });

  it('accepts has_inner_wires in face include', () => {
    const faceSchema = z.object(stepToolSchemas.queryStepFaces).strict();

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['has_inner_wires'],
      }).success
    ).toBe(true);

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['has_inner_wires', 'surface_type', 'area'],
      }).success
    ).toBe(true);
  });

  it('accepts adjacent_faces and closest_face_distance in face include and rejects unknown values', () => {
    const faceSchema = z.object(stepToolSchemas.queryStepFaces).strict();

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['adjacent_faces'],
      }).success
    ).toBe(true);

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['closest_face_distance'],
      }).success
    ).toBe(true);

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['adjacent_faces', 'closest_face_distance', 'surface_type', 'normal'],
      }).success
    ).toBe(true);

    expect(
      faceSchema.safeParse({
        file_path: blockStepFile,
        include: ['adjacent_faces', 'adjacent_faces'],
      }).success
    ).toBe(false);
  });

  it('accepts adjacent_faces in edge include', () => {
    const edgeSchema = z.object(stepToolSchemas.queryStepEdges).strict();

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        include: ['adjacent_faces'],
      }).success
    ).toBe(true);

    expect(
      edgeSchema.safeParse({
        file_path: blockStepFile,
        include: ['adjacent_faces', 'curve_type', 'length'],
      }).success
    ).toBe(true);
  });

  it('returns adjacent_faces for each face on a block', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        include: ['id', 'surface_type', 'adjacent_faces'],
        limit: 100,
      })
    );
    const entities = (result.data as Record<string, unknown>).entities as Array<
      Record<string, unknown>
    >;
    expect(entities.length).toBeGreaterThan(0);
    for (const face of entities) {
      expect(face.id).toBeTruthy();
      expect(face.adjacent_faces).toBeDefined();
      const adj = face.adjacent_faces as Array<Record<string, unknown>>;
      expect(Array.isArray(adj)).toBe(true);
      // Each face on a box has 4 adjacent faces (box has 6 faces, each touches 4).
      expect(adj.length).toBe(4);
      for (const a of adj) {
        expect(a.face_id).toMatch(/^face:/);
        expect(a.surface_type).toBeTypeOf('string');
        expect(['convex', 'concave', 'smooth', 'unknown']).toContain(a.vexity);
        expect(a.dihedral_angle_deg).toBeTypeOf('number');
      }
    }
  });

  it('returns adjacent_faces for each edge on a block', async () => {
    const result = expectSuccess(
      await handleQueryStepEdges(blockStepFile, {
        include: ['id', 'curve_type', 'adjacent_faces'],
        limit: 100,
      })
    );
    const entities = (result.data as Record<string, unknown>).entities as Array<
      Record<string, unknown>
    >;
    expect(entities.length).toBeGreaterThan(0);
    for (const edge of entities) {
      expect(edge.adjacent_faces).toBeDefined();
      const adj = edge.adjacent_faces as Array<Record<string, unknown>>;
      expect(Array.isArray(adj)).toBe(true);
      // Each edge on a manifold solid bounds exactly 2 faces.
      expect(adj.length).toBe(2);
      for (const a of adj) {
        expect(a.face_id).toMatch(/^face:/);
        expect(a.surface_type).toBeTypeOf('string');
      }
    }
  });

  it('returns has_inner_wires for each face on a block', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        include: ['id', 'surface_type', 'has_inner_wires'],
        limit: 100,
      })
    );
    const entities = (result.data as Record<string, unknown>).entities as Array<
      Record<string, unknown>
    >;
    expect(entities.length).toBeGreaterThan(0);
    for (const face of entities) {
      expect(face.has_inner_wires).toBeDefined();
      // A simple box has no inner wires (no holes through any face).
      expect(face.has_inner_wires).toBe(false);
    }
  });

  it('returns closest_face_distance for each face on a block', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        include: ['id', 'surface_type', 'center', 'closest_face_distance'],
        limit: 100,
      })
    );
    const entities = (result.data as Record<string, unknown>).entities as Array<
      Record<string, unknown>
    >;
    expect(entities.length).toBeGreaterThan(0);
    for (const face of entities) {
      expect(face.closest_face_distance).toBeDefined();
      const cfd = face.closest_face_distance as Record<string, unknown>;
      expect(cfd.face_id).toMatch(/^face:/);
      expect(typeof cfd.distance).toBe('number');
      expect((cfd.distance as number) >= 0).toBe(true);
      expect(cfd.face_id).not.toBe(face.id);
    }
  });

  it('does not accept compare options that are not implemented yet', () => {
    const compareSchema = z.object(stepToolSchemas.compareStepFiles).strict();

    expect(
      compareSchema.safeParse({
        file_a: blockStepFile,
        file_b: cylinderStepFile,
      }).success
    ).toBe(true);

    expect(
      compareSchema.safeParse({
        file_a: blockStepFile,
        file_b: cylinderStepFile,
        feature_queries: [],
      }).success
    ).toBe(false);
  });

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
  });

  it('queries edges with deterministic filtering and pagination', async () => {
    const result = expectSuccess(
      await handleQueryStepEdges(blockStepFile, {
        filter: { curve_type: ['line'] },
        limit: 10,
        offset: 0,
      })
    );
    const data = result.data as Record<string, unknown>;
    expect(data.schema_version).toBe('0.3');
    expect(data.file_path).toBe(blockStepFile);
    const entities = data.entities as unknown[];
    expect(Array.isArray(entities)).toBe(true);
    expect(entities.length).toBeGreaterThan(0);
    const firstEdge = entities[0] as Record<string, unknown>;
    expect(firstEdge.id).toBeTruthy();
    expect(firstEdge.curve_type).toBe('line');
  });

  it('queries faces with deterministic filtering and pagination', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        filter: { surface_type: ['plane'] },
        limit: 10,
        offset: 0,
      })
    );
    const data = result.data as Record<string, unknown>;
    expect(data.schema_version).toBe('0.3');
    expect(data.file_path).toBe(blockStepFile);
    const entities = data.entities as unknown[];
    expect(Array.isArray(entities)).toBe(true);
    expect(entities.length).toBeGreaterThan(0);
    const firstFace = entities[0] as Record<string, unknown>;
    expect(firstFace.id).toBeTruthy();
    expect(firstFace.surface_type).toBe('plane');
  });

  it('groups faces by surface_type with counts and sample IDs', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        result_mode: 'groups',
        group_by: ['surface_type'],
      })
    );
    const data = result.data as Record<string, unknown>;
    // In groups mode, entities are omitted to save tokens.
    expect((data.entities as unknown[]).length).toBe(0);

    const groups = data.groups as Array<Record<string, unknown>>;
    expect(groups.length).toBeGreaterThan(0);

    // A box has 6 planar faces; the plane group should reflect that.
    const planeGroup = groups.find(
      (g) => (g.key as Record<string, unknown>).surface_type === 'plane'
    );
    expect(planeGroup).toBeTruthy();
    expect(planeGroup!.entity_count).toBe(6);
    expect(planeGroup!.id).toBe('group:0'); // largest group, deterministic ordering
    const samples = planeGroup!.sample_entity_ids as string[];
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(5);
    expect(samples[0]).toMatch(/^face:/);

    // Group counts must sum to total matched faces.
    const total = groups.reduce((sum, g) => sum + (g.entity_count as number), 0);
    expect(total).toBe((data.pagination as Record<string, unknown>).total_matched);
  });

  it('groups edges by length_range to isolate buckets', async () => {
    const result = expectSuccess(
      await handleQueryStepEdges(blockStepFile, {
        result_mode: 'groups',
        group_by: ['length_range'],
        sample_entity_limit: 3,
      })
    );
    const data = result.data as Record<string, unknown>;
    const groups = data.groups as Array<Record<string, unknown>>;
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect((g.sample_entity_ids as string[]).length).toBeLessThanOrEqual(3);
      expect((g.key as Record<string, unknown>).length_range).toBeTypeOf('string');
    }
  });

  it('summary mode returns statistics without an entity list', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        result_mode: 'summary',
      })
    );
    const data = result.data as Record<string, unknown>;
    expect((data.entities as unknown[]).length).toBe(0);
    expect((data.groups as unknown[]).length).toBe(0);
    const stats = data.statistics as Record<string, unknown>;
    expect(stats.total_faces).toBeGreaterThan(0);
  });

  it('omits the clusters array from query responses', async () => {
    const result = expectSuccess(
      await handleQueryStepFaces(blockStepFile, { result_mode: 'summary' })
    );
    expect('clusters' in (result.data as Record<string, unknown>)).toBe(false);
  });

  it('filters faces by group_ids from a previous grouping', async () => {
    // First, get the groups for a box (6 planar faces).
    const groupResult = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        result_mode: 'groups',
        group_by: ['surface_type'],
      })
    );
    const groupData = groupResult.data as Record<string, unknown>;
    const groups = groupData.groups as Array<Record<string, unknown>>;
    expect(groups.length).toBeGreaterThan(0);

    // The plane group should be group:0 (6 faces).
    const planeGroup = groups.find(
      (g) => (g.key as Record<string, unknown>).surface_type === 'plane'
    );
    expect(planeGroup).toBeTruthy();
    expect(planeGroup!.entity_count).toBe(6);

    const groupId = planeGroup!.id as string;

    // Now filter by that group_id using the same group_by.
    const filtered = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        group_by: ['surface_type'],
        filter: { group_ids: [groupId] },
        result_mode: 'entities',
      })
    );
    const filteredData = filtered.data as Record<string, unknown>;
    const faces = filteredData.entities as Array<Record<string, unknown>>;
    expect(faces.length).toBe(6);
    for (const f of faces) {
      expect(f.surface_type).toBe('plane');
    }

    // Without group_by, the default (surface_type) is used, so results match.
    const defaultGb = expectSuccess(
      await handleQueryStepFaces(blockStepFile, {
        filter: { group_ids: [groupId] },
        result_mode: 'entities',
      })
    );
    const defaultGbData = defaultGb.data as Record<string, unknown>;
    expect((defaultGbData.entities as unknown[]).length).toBe(6);
  });

  it('filters edges by group_ids from length_range grouping', async () => {
    // Get the tiny-edge group from a box (lengths vary).
    const groupResult = expectSuccess(
      await handleQueryStepEdges(blockStepFile, {
        result_mode: 'groups',
        group_by: ['length_range'],
      })
    );
    const groups = (groupResult.data as Record<string, unknown>).groups as Array<
      Record<string, unknown>
    >;

    // Find a non-empty group.
    const targetGroup = groups.find((g) => (g.entity_count as number) > 0);
    expect(targetGroup).toBeTruthy();

    const filtered = expectSuccess(
      await handleQueryStepEdges(blockStepFile, {
        group_by: ['length_range'],
        filter: { group_ids: [targetGroup!.id as string] },
        result_mode: 'entities',
      })
    );
    const entities = (filtered.data as Record<string, unknown>).entities as Array<
      Record<string, unknown>
    >;
    expect(entities.length).toBe(targetGroup!.entity_count as number);
    expect(entities.length).toBeGreaterThan(0);
  });

  it('compares two files with metric deltas', async () => {
    const result = expectSuccess(await handleCompareStepFiles(blockStepFile, cylinderStepFile));
    const deltas = result.data.deltas as Record<string, unknown>;
    expect(deltas.volume).toBeTypeOf('number');
    expect(deltas.bodyCount).toBe(0);
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
