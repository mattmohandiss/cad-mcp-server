/**
 * Eval runner unit/smoke coverage without API calls or MCP server connections.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareAnswer } from '../../eval/runner/scoring.js';
import { parseFrontmatter } from '../../eval/runner/scenarios.js';
import { loadScenarios, DEFAULT_MODELS, runAll } from '../../eval/runner/runner.js';

describe('eval runner', () => {
  it('has default models', () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThan(0);
    expect(DEFAULT_MODELS).toContain('anthropic/claude-sonnet-4-5');
  });

  it('loads scenarios with valid structure', () => {
    const scenarios = loadScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      expect(scenario.id).toBeTruthy();
      expect(scenario.field).toBeTruthy();
      expect(scenario.prompt).toBeTruthy();
      expect(Number.isFinite(scenario.tolerance)).toBe(true);
      expect(Number.isFinite(scenario.max_steps)).toBe(true);
      expect(scenario.max_steps).toBeGreaterThan(0);
    }
  });

  it('every scenario has generate.py and scenario.md', () => {
    const scenariosDir = path.join(process.cwd(), 'eval', 'scenarios');
    const entries = fs.readdirSync(scenariosDir);
    for (const entry of entries) {
      const dir = path.join(scenariosDir, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      expect(fs.existsSync(path.join(dir, 'scenario.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'generate.py'))).toBe(true);
    }
  });

  it('rejects unknown scenario IDs before running models', async () => {
    await expect(
      runAll({ models: [DEFAULT_MODELS[0]], scenarioIds: ['missing-scenario'] }),
    ).rejects.toThrow('Unknown scenario ID');
  });

  it('rejects non-finite numeric frontmatter', () => {
    const raw = `---
id: bad
field: volume_mm3
tolerance: nope
max_steps: 8
files:
  part: part.step
---
Prompt`;

    expect(() => parseFrontmatter(raw, 'bad/scenario.md')).toThrow('tolerance');
  });

  it('uses 0.01 percent relative fallback for numeric scoring', () => {
    expect(compareAnswer(100.005, 100, 0)).toBe(true);
    expect(compareAnswer(100.02, 100, 0)).toBe(false);
  });

  it('runOne fails when gateway auth is missing', async () => {
    const { runOne } = await import('../../eval/runner/runner.js');
    const scenarios = loadScenarios();
    const saved = process.env.AI_GATEWAY_API_KEY;
    const savedOidc = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    try {
      await expect(runOne(DEFAULT_MODELS[0], scenarios[0])).rejects.toThrow();
    } finally {
      if (saved !== undefined) process.env.AI_GATEWAY_API_KEY = saved;
      if (savedOidc !== undefined) process.env.VERCEL_OIDC_TOKEN = savedOidc;
    }
  }, 30_000);
});
