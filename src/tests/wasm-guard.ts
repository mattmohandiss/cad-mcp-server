import * as fs from 'node:fs';
import * as path from 'node:path';

export function isWasmAvailable(): boolean {
  return fs.existsSync(
    path.join(process.cwd(), 'node_modules', 'occt-wasm', 'dist', 'occt-wasm.wasm'),
  );
}
