import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { OcctKernel } from 'occt-wasm';

export const NIST_FILE = path.join(
  process.cwd(),
  'samples',
  'NIST-PMI-STEP-Files',
  'AP203 geometry only',
  'nist_ftc_11_asme1_rb.stp'
);

export async function generateStep(gen: (kernel: OcctKernel) => string): Promise<string> {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'cad-mcp-'));
  const stepFile = path.join(fixtureDir, `fixture_${Math.random().toString(36).slice(2, 8)}.step`);
  const kernel = await OcctKernel.init();
  const stepData = gen(kernel);
  kernel[Symbol.dispose]?.();
  await writeFile(stepFile, stepData, 'utf8');
  return stepFile;
}
