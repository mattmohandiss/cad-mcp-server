import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SidecarClient } from '../sidecar/client.js';

const executable = process.env['CAD_MCP_SIDECAR'];
const fixture = fileURLToPath(new URL('./fixtures/repeated-instances.step', import.meta.url));
const enabled = Boolean(executable && existsSync(executable) && existsSync(fixture));

describe.skipIf(!enabled)('repeated-instance assembly sidecar integration', () => {
  let client: SidecarClient | undefined;
  let modelId: number | undefined;

  beforeAll(async () => {
    client = new SidecarClient({ executable: executable! });
    const opened = await client.request<{ modelId: number }>('open', { path: fixture });
    modelId = opened.result.modelId;
  });

  afterAll(async () => {
    if (client?.isAlive) {
      if (modelId !== undefined) await client.request('close', { modelId });
      await client.stop();
    }
  });

  it('assigns distinct occurrence IDs and resolves each instance in its own location', async () => {
    const inspected = await client!.request<{
      xcaf: { rootAssemblies: number; components: number; occurrenceIds: string[] };
    }>('inspect', { modelId: modelId! });
    expect(inspected.result.xcaf).toMatchObject({
      rootAssemblies: 1,
      components: 2,
      occurrenceIds: ['RepeatedPart#0', 'RepeatedPart#1'],
    });

    const found = await client!.request<{
      entities: Array<{ id: string; bbox_center: number[] }>;
      total_matched: number;
    }>('findEntities', {
      modelId: modelId!,
      entityType: 'body',
      componentName: 'RepeatedPart',
      limit: 10,
      offset: 0,
    });
    expect(found.result.total_matched).toBe(2);
    expect(found.result.entities.map((entity) => entity.id)).toEqual([
      'component:RepeatedPart#0/body:0',
      'component:RepeatedPart#1/body:0',
    ]);
    expect(found.result.entities.map((entity) => entity.bbox_center[0])).toEqual([5, 25]);

    const measured = await client!.request<{
      minimum: { source_entity_id: string; target_entity_id: string; distance: number };
    }>('measureEntityDistances', {
      modelId: modelId!,
      sources: [found.result.entities[0]!.id],
      targets: [found.result.entities[1]!.id],
      summary: 'minimum',
    });
    expect(measured.result.minimum).toEqual({
      source_entity_id: 'component:RepeatedPart#0/body:0',
      target_entity_id: 'component:RepeatedPart#1/body:0',
      distance: 10,
    });
  });
});
