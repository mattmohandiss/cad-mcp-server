import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SidecarClient } from './client.js';

let client: SidecarClient | undefined;

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
    const hello = await started.request<{ protocol: number; occt: string }>('hello', {}, 10_000);
    if (hello.result.protocol !== 2) {
      throw new Error(`Unsupported sidecar protocol: ${hello.result.protocol}`);
    }
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
    if (process.arch === 'arm64') return asset('ape-aarch64.elf');
  }
  if (process.platform === 'darwin') {
    if (process.arch === 'x64') return asset('ape-x86_64.macho');
    if (process.arch === 'arm64') return asset('ape-aarch64.macho');
  }
  if (process.platform === 'win32' && process.arch === 'x64') return undefined;
  throw new Error(`Unsupported sidecar host: ${process.platform}/${process.arch}`);
}

function asset(name: string): string {
  return fileURLToPath(new URL(`./bin/${name}`, import.meta.url));
}
