/**
 * Smoke test: validates that the eval runner's plumbing is wired
 * correctly without making any API calls. Run this in CI; the actual
 * LLM eval (src/tests/llm-eval.test.ts) is gated on OPENROUTER_API_KEY.
 */

import { describe, expect, it } from 'vitest';
import { EVAL_MODELS } from '../../eval/runner/model-registry.js';
import { QUESTIONS } from '../../eval/runner/questions.js';
import { runAll } from '../../eval/runner/runner.js';

describe('eval runner: plumbing smoke test', () => {
  it('loads 3 models in the registry', () => {
    expect(EVAL_MODELS).toHaveLength(3);
    expect(EVAL_MODELS.map((m) => m.family).sort()).toEqual(['anthropic', 'google', 'openai']);
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
    const { join } = await import('node:path');
    for (const q of QUESTIONS) {
      const stepPath = join(process.cwd(), 'samples', 'eval-generated', q.targetFile);
      const metaPath = stepPath.replace(/\.step$/, '.meta.json');
      await expect(access(stepPath)).resolves.toBeUndefined();
      await expect(access(metaPath)).resolves.toBeUndefined();
    }
  });

  it('runAll fails fast on a missing API key', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(
        runAll({
          apiKey: '',
          models: [EVAL_MODELS[0]],
          questions: [QUESTIONS[0]],
        }),
      ).rejects.toThrow();
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
    }
  });
});
