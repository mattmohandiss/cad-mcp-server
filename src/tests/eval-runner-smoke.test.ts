/**
 * Smoke test: validates that the eval runner's plumbing is wired
 * correctly without making any API calls or MCP server connections.
 * Run this in CI.
 */

import { describe, expect, it } from 'vitest';
import { EVAL_MODELS } from '../../eval/runner/model-registry.js';
import { QUESTIONS } from '../../eval/runner/questions.js';

describe('eval runner: plumbing smoke test', () => {
  it('loads 3 models in the registry', () => {
    expect(EVAL_MODELS).toHaveLength(3);
    expect(EVAL_MODELS.map((m) => m.id)).toEqual([
      'anthropic/claude-sonnet-4-5',
      'gpt-4o-mini',
      'google/gemini-2.5-flash',
    ]);
  });

  it('loads 5 questions with valid structure', () => {
    expect(QUESTIONS).toHaveLength(5);
    for (const q of QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(q.prompt).toBeTruthy();
      expect(q.targetFile).toMatch(/\.step$/);
      expect(q.expected.kind).toMatch(/number|boolean|string/);
      expect(typeof q.extract).toBe('function');
    }
  });

  it('every question references an existing STEP file and meta.json', async () => {
    const { access } = await import('node:fs/promises');
    for (const q of QUESTIONS) {
      const stepPath = new URL(`../../samples/eval-generated/${q.targetFile}`, import.meta.url);
      const metaPath = stepPath.pathname.replace(/\.step$/, '.meta.json');
      await expect(access(stepPath.pathname)).resolves.toBeUndefined();
      await expect(access(metaPath)).resolves.toBeUndefined();
    }
  });

  it('runOne fails fast when OPENROUTER_API_KEY is missing', async () => {
    const { runOne } = await import('../../eval/runner/runner.js');
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(runOne(EVAL_MODELS[0], QUESTIONS[0])).rejects.toThrow();
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
    }
  }, 30_000);
});
