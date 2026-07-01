import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVAL_WORK_DIR, SCENARIOS_DIR, resolvePython } from './config.js';
import type { ScenarioMeta } from './types.js';

export function loadScenarios(): ScenarioMeta[] {
  if (!fs.existsSync(SCENARIOS_DIR)) return [];

  return fs
    .readdirSync(SCENARIOS_DIR)
    .flatMap((entry) => {
      const dir = path.join(SCENARIOS_DIR, entry);
      const mdPath = path.join(dir, 'scenario.md');
      if (!fs.statSync(dir).isDirectory() || !fs.existsSync(mdPath)) return [];

      const raw = fs.readFileSync(mdPath, 'utf8');
      const frontmatter = parseFrontmatter(raw, mdPath);
      return [{ ...frontmatter, prompt: frontmatter.body.trim(), dir }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function generateGroundTruth(
  scenario: ScenarioMeta,
):
  | { ok: true; groundTruth: Record<string, unknown>; scenario: ScenarioMeta }
  | { ok: false; error: string } {
  const generatePath = path.join(scenario.dir, 'generate.py');
  if (!fs.existsSync(generatePath)) return { ok: false, error: 'generate.py missing' };

  const workDir = path.join(EVAL_WORK_DIR, scenario.id);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  try {
    execFileSync(resolvePython(), ['generate.py'], {
      cwd: scenario.dir,
      env: { ...process.env, CAD_MCP_EVAL_OUTPUT_DIR: workDir },
      stdio: 'pipe',
      timeout: 30_000,
    });
  } catch (error) {
    return {
      ok: false,
      error: `generate.py failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const groundTruthPath = path.join(scenario.dir, 'ground-truth.json');
  if (!fs.existsSync(groundTruthPath)) return { ok: false, error: 'ground-truth.json missing' };

  try {
    return {
      ok: true,
      groundTruth: JSON.parse(fs.readFileSync(groundTruthPath, 'utf8')),
      scenario: { ...scenario, prompt: buildPromptWithFiles(scenario, workDir), workDir },
    };
  } catch {
    return { ok: false, error: 'ground-truth.json parse error' };
  }
}

function buildPromptWithFiles(scenario: ScenarioMeta, workDir: string): string {
  const fileLines = Object.entries(scenario.files).map(
    ([label, filename]) => `- ${label}: ${path.join(workDir, filename)}`,
  );

  return [
    scenario.prompt,
    '',
    'Generated STEP files:',
    ...fileLines,
    '',
    'Use these exact file paths when calling CAD tools.',
  ].join('\n');
}

function parseFrontmatter(
  raw: string,
  filePath: string,
): Omit<ScenarioMeta, 'prompt' | 'dir'> & { body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filePath} missing frontmatter`);

  const meta: Record<string, string> = {};
  const files: Record<string, string> = {};
  let section: 'files' | null = null;

  for (const line of match[1].split('\n')) {
    if (line.trim() === 'files:') {
      section = 'files';
      continue;
    }

    if (section === 'files') {
      const file = line.match(/^\s+([a-zA-Z0-9_-]+):\s*(.+)$/);
      if (file) {
        files[file[1]] = file[2];
        continue;
      }
      section = null;
    }

    const kv = line.match(/^([a-z_]+):\s*(.+)$/i);
    if (kv) meta[kv[1]] = kv[2];
  }

  if (!meta.id || !meta.field) throw new Error(`${filePath} missing id or field`);
  if (Object.keys(files).length === 0) throw new Error(`${filePath} missing files`);

  return {
    id: meta.id,
    field: meta.field,
    tolerance: Number(meta.tolerance ?? 0),
    max_steps: Number(meta.max_steps ?? 8),
    files,
    body: match[2],
  };
}
