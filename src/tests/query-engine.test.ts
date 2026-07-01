import { describe, expect, it } from 'vitest';
import { executeQuery } from '../query/engine.js';
import { NIST_FILE } from './fixtures.js';
import { isWasmAvailable } from './wasm-guard.js';

describe('QueryEngine: query dispatch', () => {
  it('rejects unsupported entity types', async () => {
    await expect(
      executeQuery({
        file_path: NIST_FILE,
        from: 'pmi' as never,
      }),
    ).rejects.toMatchObject({ type: 'not_implemented' });
  });

  it.runIf(isWasmAvailable())(
    'routes faces queries through the engine and returns a query envelope',
    async () => {
      const data = await executeQuery({
        file_path: NIST_FILE,
        from: 'faces',
        where: { surface_type: 'cylinder' },
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
      from: 'edges',
      where: { length_max: 5 },
      limit: 3,
    });
    expect(data.schema_version).toBeDefined();
    expect(Array.isArray(data.entities)).toBe(true);
  });

  it('rejects unknown entity types with a clean error', async () => {
    await expect(
      executeQuery({
        file_path: NIST_FILE,
        from: 'bodies' as never,
      }),
    ).rejects.toMatchObject({ type: 'not_implemented' });
  });

  it('rejects entity IDs that do not match the queried entity type', async () => {
    await expect(
      executeQuery({
        file_path: NIST_FILE,
        from: 'faces',
        entity_ids: ['edge:0'],
      }),
    ).rejects.toMatchObject({
      type: 'invalid_input',
      message: 'entity_ids for from: "faces" must use face:N IDs. Got "edge:0".',
    });
  });
});

describe('QueryEngine: query envelope', () => {
  it.runIf(isWasmAvailable())('returns the standard query response envelope', async () => {
    const data = await executeQuery({
      file_path: NIST_FILE,
      from: 'faces',
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
  });
});
