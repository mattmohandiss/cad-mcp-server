/**
 * Tiny .env loader for the eval tests. Reads key=value pairs from
 * eval/.env (if present) and exposes them as process.env entries.
 * Only the keys listed in ALLOWED_KEYS are loaded; everything else
 * is ignored.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_KEYS = new Set(['OPENROUTER_API_KEY']);

export function loadEvalEnv(): void {
  const path = join(process.cwd(), 'eval', '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!ALLOWED_KEYS.has(key)) continue;
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}
