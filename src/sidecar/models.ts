import type { Stats } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { SidecarClient } from './client.js';
import { getSidecarClient, stopSidecar } from './runtime.js';
import { fileRevision } from '../utils/hash.js';

interface CachedModel {
  cacheKey: string;
  filePath: string;
  modelId: number;
  client: SidecarClient;
}

type ModelOperation<T> = (
  client: SidecarClient,
  modelId: number,
  filePath: string,
  revision: string,
) => Promise<T> | T;

/** One resident model bounds sidecar memory; requests are serialized by the OCCT process. */
export class SidecarModelStore {
  private cached: CachedModel | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  withModel<T>(
    filePath: string,
    operation: ModelOperation<T>,
    expectedRevision?: string,
  ): Promise<T> {
    const result = this.queue.then(
      () => this.withModelExclusive(filePath, operation, expectedRevision),
      () => this.withModelExclusive(filePath, operation, expectedRevision),
    );
    this.queue = result.catch(() => undefined);
    return result;
  }

  close(): Promise<void> {
    const result = this.queue.then(async () => {
      const cached = this.cached;
      this.cached = undefined;
      if (cached?.client.isAlive) {
        try {
          await cached.client.request('close', { modelId: cached.modelId });
        } catch {
          // Process teardown below releases every handle, even after a failed close.
        }
      }
      await stopSidecar();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async withModelExclusive<T>(
    requestedPath: string,
    operation: ModelOperation<T>,
    expectedRevision?: string,
  ): Promise<T> {
    let filePath: string;
    try {
      filePath = await realpath(requestedPath);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      const type = code === 'ENOENT' ? 'file_not_found' : 'invalid_input';
      throw { type, message: `Cannot open STEP file ${requestedPath}: ${errorMessage(error)}` };
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error(`STEP path is not a regular file: ${requestedPath}`);

    const revision = await fileRevision(filePath);
    await assertUnchanged(filePath, fileStat);
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw {
        type: 'stale_reference',
        message: `Artifact revision mismatch: expected ${expectedRevision}, found ${revision}`,
      };
    }
    const cacheKey = `${filePath}:${revision}`;
    const client = await getSidecarClient();
    if (this.cached && this.cached.client === client && this.cached.cacheKey === cacheKey) {
      const result = await operation(client, this.cached.modelId, filePath, revision);
      await assertUnchanged(filePath, fileStat, revision);
      return result;
    }

    await this.releaseCachedModel(client);
    const opened = await client.request('open', { path: filePath }, 600_000);
    if (!Number.isInteger(opened.result.modelId) || opened.result.modelId < 1) {
      throw new Error('OCCT sidecar returned an invalid model handle');
    }

    this.cached = { cacheKey, filePath, modelId: opened.result.modelId, client };
    const result = await operation(client, opened.result.modelId, filePath, revision);
    await assertUnchanged(filePath, fileStat, revision);
    return result;
  }

  private async releaseCachedModel(client: SidecarClient): Promise<void> {
    const cached = this.cached;
    this.cached = undefined;
    if (!cached || cached.client !== client || !cached.client.isAlive) return;
    try {
      await cached.client.request('close', { modelId: cached.modelId });
    } catch (error) {
      await stopSidecar();
      throw error;
    }
  }
}

async function assertUnchanged(
  filePath: string,
  initialStat: Stats,
  expectedRevision?: string,
): Promise<void> {
  const currentRevision = expectedRevision === undefined ? undefined : await fileRevision(filePath);
  const currentStat = await stat(filePath);
  if (
    currentStat.dev !== initialStat.dev ||
    currentStat.ino !== initialStat.ino ||
    currentStat.size !== initialStat.size ||
    currentStat.mtimeMs !== initialStat.mtimeMs
  ) {
    throw {
      type: 'stale_reference',
      message: 'STEP file changed while it was being analyzed; retry against the current file.',
    };
  }
  if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
    throw {
      type: 'stale_reference',
      message: `STEP file changed while it was being analyzed; expected ${expectedRevision}.`,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const sidecarModels = new SidecarModelStore();
