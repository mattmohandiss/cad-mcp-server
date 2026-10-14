import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSidecarClient, stopSidecar, request } = vi.hoisted(() => ({
  getSidecarClient: vi.fn(),
  stopSidecar: vi.fn(async () => undefined),
  request: vi.fn(),
}));

vi.mock('../sidecar/runtime.js', () => ({ getSidecarClient, stopSidecar }));

import { SidecarModelStore } from '../sidecar/models.js';
import { fileRevision } from '../utils/hash.js';

describe('artifact revision checks', () => {
  let directory: string | undefined;
  afterEach(async () => {
    vi.clearAllMocks();
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  async function fixture() {
    directory = await mkdtemp(join(tmpdir(), 'cad-artifact-'));
    const file = join(directory, 'part.step');
    await writeFile(file, 'original exact STEP bytes');
    request.mockImplementation(async (operation: string) => ({
      result: operation === 'open' ? { modelId: 1 } : {},
      kernelMs: 0,
    }));
    getSidecarClient.mockResolvedValue({ request, isAlive: true });
    return file;
  }

  it('rejects an entity call with an old expected revision before opening a model', async () => {
    const file = await fixture();
    await expect(
      new SidecarModelStore().withModel(file, async () => null, `sha256:${'0'.repeat(64)}`),
    ).rejects.toMatchObject({ type: 'stale_reference' });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails analysis if source bytes change during the operation', async () => {
    const file = await fixture();
    const store = new SidecarModelStore();
    const revision = await fileRevision(file);
    await expect(
      store.withModel(file, async () => {
        await writeFile(file, 'changed while OCCT was analyzing');
        return { revision };
      }),
    ).rejects.toMatchObject({ type: 'stale_reference' });
  });
});
