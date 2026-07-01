/**
 * Smoke test: validates that the eval runner's plumbing is wired
 * correctly without making any API calls or MCP server connections.
 * Run this in CI.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadScenarios, DEFAULT_MODELS } from '../../eval/runner/runner.js';

describe('eval runner: plumbing smoke test', () => {
  it('has 3 default models', () => {
    expect(DEFAULT_MODELS).toHaveLength(3);
    expect(DEFAULT_MODELS).toContain('anthropic/claude-sonnet-4-5');
    expect(DEFAULT_MODELS).toContain('openai/gpt-4o-mini');
    expect(DEFAULT_MODELS).toContain('google/gemini-2.5-flash');
  });

  it('loads 10 scenarios with valid structure', () => {
    const scenarios = loadScenarios();
    expect(scenarios.length).toBe(10);
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.field).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(typeof s.max_steps).toBe('number');
      expect(s.max_steps).toBeGreaterThan(0);
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

  it('runOne fails when AI_GATEWAY_API_KEY is missing', async () => {
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
