import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SidecarClient } from './client.js';
import { SIDECAR_OPS } from './operations.js';

let client: SidecarClient | undefined;

/**
 * Fail at connect when the binary does not implement what this package calls.
 *
 * Without this the mismatch surfaced later as an MCP tool error with *empty
 * content* and `Unknown operation: pmi` only in the error field, which two
 * evaluation runs missed. A binary that reports nothing lists every operation as
 * missing, so there is one failure mode and one message.
 */
export function assertOperations(ops: readonly string[] | undefined, executable: string): void {
  const available = new Set(ops);
  const missing = SIDECAR_OPS.filter((op) => !available.has(op));
  if (missing.length > 0) {
    throw new Error(
      `OCCT sidecar at ${executable} does not implement ${missing.join(', ')}. ` +
        'The server source is newer than the binary being run, so a tool would fail ' +
        'mid-conversation instead. Rebuild the sidecar payload, or point ' +
        'CAD_MCP_SIDECAR at a current build.',
    );
  }
}

export async function getSidecarClient(): Promise<SidecarClient> {
  if (client?.isAlive) return client;
  client = undefined;

  const configuredExecutable = process.env['CAD_MCP_SIDECAR'] ?? process.env['OCCT_SIDECAR'];
  const executable = configuredExecutable ?? asset('occt-sidecar.exe');
  const launcherOverride = process.env['CAD_MCP_SIDECAR_LAUNCHER'] ?? process.env['OCCT_LAUNCHER'];
  const launcher = launcherOverride ?? (configuredExecutable ? undefined : defaultLauncher());
  if (!existsSync(executable))
    throw new Error(`OCCT Cosmopolitan sidecar not found: ${executable}`);
  if (launcher && !existsSync(launcher))
    throw new Error(`OCCT sidecar launcher not found: ${launcher}`);

  const started = new SidecarClient({ executable, launcher });
  client = started;
  try {
    const hello = await started.request('hello', {}, 10_000);
    if (hello.result.protocol !== 2) {
      throw new Error(`Unsupported sidecar protocol: ${hello.result.protocol}`);
    }
    assertOperations(hello.result.ops, executable);
    return started;
  } catch (error) {
    if (client === started) client = undefined;
    await started.stop();
    throw error;
  }
}

export async function stopSidecar(): Promise<void> {
  const current = client;
  client = undefined;
  await current?.stop();
}

function defaultLauncher(): string | undefined {
  if (process.platform === 'linux') {
    if (process.arch === 'x64') return asset('ape-x86_64.elf');
  }
  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return asset('ape-aarch64.macho');
  }
  if (process.platform === 'win32' && process.arch === 'x64') return undefined;
  throw new Error(`Unsupported sidecar host: ${process.platform}/${process.arch}`);
}

function asset(name: string): string {
  return fileURLToPath(new URL(`./bin/${name}`, import.meta.url));
}
