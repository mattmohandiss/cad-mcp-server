import { describe, expect, it } from 'vitest';
import { executeQuery } from '../query/engine.js';
import { executePipeline } from '../query/pipeline.js';
import { NIST_FILE } from './fixtures.js';
import { isWasmAvailable } from './wasm-guard.js';
import * as path from 'node:path';

const ap242File = path.join(
  process.cwd(),
  'samples',
  'NIST-PMI-STEP-Files',
  'nist_ftc_08_asme1_ap242-e2.stp',
);

describe('QueryEngine: query_step dispatch', () => {
  it('rejects unsupported entity types with a clear migration message', async () => {
    await expect(
      executeQuery({
        file_path: NIST_FILE,
        entities: 'pmi',
      }),
    ).rejects.toMatchObject({ type: 'not_implemented' });
  });

  it.runIf(isWasmAvailable())(
    'routes faces queries through the engine and returns a queryOutputSchema envelope',
    async () => {
      const data = await executeQuery({
        file_path: NIST_FILE,
        entities: 'faces',
        filter: { surface_type: 'cylinder' },
        limit: 5,
      });
      expect(data.schema_version).toBeDefined();
      expect(data.file_path).toBe(NIST_FILE);
      expect((data.units as unknown as Record<string, unknown>).length).toBe('mm');
      expect((data.pagination as unknown as Record<string, unknown>).limit).toBe(5);
      expect(Array.isArray(data.entities)).toBe(true);
    },
  );

  it.runIf(isWasmAvailable())('routes edges queries through the engine', async () => {
    const data = await executeQuery({
      file_path: NIST_FILE,
      entities: 'edges',
      filter: { length_max: 5 },
      limit: 3,
    });
    expect(data.schema_version).toBeDefined();
    expect(Array.isArray(data.entities)).toBe(true);
  });

  it('rejects unknown entity types with a clean error', async () => {
    await expect(
      executeQuery({
        file_path: NIST_FILE,
        entities: 'vertices',
      }),
    ).rejects.toMatchObject({ type: 'not_implemented' });
  });
});

describe('QueryEngine: query_step migrate parity', () => {
  it.runIf(isWasmAvailable())(
    'returns the same envelope shape as the legacy 9-tool surface',
    async () => {
      const data = await executeQuery({
        file_path: NIST_FILE,
        entities: 'faces',
        limit: 1,
      });
      expect(data).toHaveProperty('schema_version');
      expect(data).toHaveProperty('file_path');
      expect(data).toHaveProperty('units');
      expect(data).toHaveProperty('coordinate_system');
      expect(data).toHaveProperty('query');
      expect(data).toHaveProperty('statistics');
      expect(data).toHaveProperty('pagination');
      expect(data).toHaveProperty('entities');
      expect(data).toHaveProperty('groups');
      expect(data).toHaveProperty('warnings');
      expect(data).toHaveProperty('limitations');
    },
  );
});

describe('PipelineExecutor: transact_step', () => {
  it.runIf(isWasmAvailable())('executes a single query step and returns the result', async () => {
    const result = await executePipeline({
      file_path: NIST_FILE,
      pipeline: [
        { op: 'query', params: { entities: 'faces', filter: { surface_type: 'plane' }, limit: 5 } },
      ],
    });
    expect(result.file_path).toBe(NIST_FILE);
    expect(result.steps).toBeUndefined(); // return_intermediate not set
  });

  it.runIf(isWasmAvailable())(
    'returns intermediate step results when return_intermediate is true',
    async () => {
      const result = await executePipeline({
        file_path: NIST_FILE,
        pipeline: [
          { op: 'query', params: { entities: 'faces', limit: 3 } },
          { op: 'select', fields: ['id', 'surface_type'] },
        ],
        return_intermediate: true,
      });
      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(2);
      expect(result.steps?.[0]?.op).toBe('query');
      expect(result.steps?.[1]?.op).toBe('select');
    },
  );

  it.runIf(isWasmAvailable())(
    'select projects the previous step result to specified fields',
    async () => {
      const result = await executePipeline({
        file_path: NIST_FILE,
        pipeline: [
          { op: 'query', params: { entities: 'faces', limit: 3 } },
          { op: 'select', fields: ['id', 'surface_type'] },
        ],
      });
      const value = result.result as Array<Record<string, unknown>>;
      expect(Array.isArray(value)).toBe(true);
      for (const item of value) {
        expect(Object.keys(item).sort()).toEqual(['id', 'surface_type']);
      }
    },
  );

  it('stages for_each / filter_results / walk_assembly with a limitations entry', async () => {
    const result = await executePipeline({
      file_path: ap242File,
      pipeline: [
        {
          op: 'walk_assembly',
          params: { per_node: [{ op: 'query', params: { entities: 'bodies' } }] },
        },
      ],
    });
    expect(result.limitations.some((l) => l.includes('walk_assembly'))).toBe(true);
  });

  it('throws on unknown pipeline op', async () => {
    await expect(
      executePipeline({
        file_path: NIST_FILE,
        pipeline: [{ op: 'mystery_op' as never }],
      }),
    ).rejects.toMatchObject({ type: 'pipeline_error' });
  });
});
