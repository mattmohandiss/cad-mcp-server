import { realpath, stat } from 'node:fs/promises';
import type { SidecarClient } from './client.js';
import { getSidecarClient, stopSidecar } from './runtime.js';

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
) => Promise<T> | T;

/** One resident model bounds sidecar memory; requests are serialized by the OCCT process. */
export class SidecarModelStore {
  private cached?: CachedModel;
  private queue: Promise<unknown> = Promise.resolve();

  withModel<T>(filePath: string, operation: ModelOperation<T>): Promise<T> {
    const result = this.queue.then(
      () => this.withModelExclusive(filePath, operation),
      () => this.withModelExclusive(filePath, operation),
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

    const cacheKey = `${filePath}:${fileStat.size}:${fileStat.mtimeMs}`;
    const client = await getSidecarClient();
    if (this.cached && this.cached.client === client && this.cached.cacheKey === cacheKey) {
      return operation(client, this.cached.modelId, filePath);
    }

    await this.releaseCachedModel(client);
    const opened = await client.request<{ modelId: number }>('open', { path: filePath }, 600_000);
    if (!Number.isInteger(opened.result.modelId) || opened.result.modelId < 1) {
      throw new Error('OCCT sidecar returned an invalid model handle');
    }

    this.cached = { cacheKey, filePath, modelId: opened.result.modelId, client };
    return operation(client, opened.result.modelId, filePath);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const sidecarModels = new SidecarModelStore();
