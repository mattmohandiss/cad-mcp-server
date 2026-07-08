import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
] as const;

export const EVAL_ROOT = path.resolve(process.cwd(), 'eval');
export const SCENARIOS_DIR = path.join(EVAL_ROOT, 'scenarios');
export const DEFAULT_LOG_DIR = path.resolve(EVAL_ROOT, 'runs');

export function loadEvalEnv(): void {
  if (process.env.AI_GATEWAY_API_KEY) return;

  const envPath = path.join(EVAL_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^AI_GATEWAY_API_KEY\s*=\s*(.+)$/);
    if (match) {
      process.env.AI_GATEWAY_API_KEY = match[1].replace(/^["']|["']$/g, '');
      return;
    }
  }
}

export function assertGatewayAuth(): void {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for eval runs');
  }
}

export function resolvePython(): string {
  const candidates = [process.env.PYTHON, path.join(EVAL_ROOT, '.venv', 'bin', 'python')].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error && result.status === 0) return candidate;
  }

  throw new Error('Eval Python environment missing. Run `just setup-eval` before `just eval`.');
}

export function resolveServerPath(): string {
  const builtServer = path.resolve(process.cwd(), 'dist', 'src', 'index.js');
  if (fs.existsSync(builtServer)) return builtServer;

  return new URL('../../../dist/src/index.js', import.meta.url).pathname;
}
