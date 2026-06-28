/**
 * LLM eval test (vitest wrapper).
 *
 * Runs the multi-model eval against the OpenRouter API. Skipped if
 * OPENROUTER_API_KEY is not set (so CI without the key stays green).
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx vitest run src/tests/llm-eval.test.ts
 *
 * Each question × model combination is a separate vitest test case,
 * so failures are clearly attributable. Full conversation transcripts
 * are written to tests/eval-logs/ for debugging.
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { loadEvalEnv } from '../../eval/runner/env-loader.js';
import { EVAL_MODELS } from '../../eval/runner/model-registry.js';
import { QUESTIONS } from '../../eval/runner/questions.js';
import { runAll, formatReport, type RunResult } from '../../eval/runner/runner.js';

loadEvalEnv();

const LOG_DIR = path.join(process.cwd(), 'tests', 'eval-logs');
const API_KEY_ENV = 'OPENROUTER_API_KEY';

function hasApiKey(): boolean {
  return Boolean(process.env[API_KEY_ENV]);
}

describe.skipIf(!hasApiKey())('LLM eval: 4-tool surface across providers', () => {
  if (!hasApiKey()) return;

  const allResults: RunResult[] = [];

  it('runs all questions across all models and reports a per-model pass rate', async () => {
    const apiKey = process.env[API_KEY_ENV] as string;
    const bulk = await runAll({ apiKey, logDir: LOG_DIR });
    allResults.push(...bulk.results);
    /* Print the report to stdout for visibility. */
    process.stdout.write(formatReport(bulk));

    /* The eval is a smoke test; we don't fail on individual model
     * regressions. The point is to surface results. We do fail if NO
     * model passes any question (which would mean the surface is
     * completely broken). */
    expect(bulk.overall.total).toBeGreaterThan(0);
    expect(bulk.overall.pass).toBeGreaterThan(0);
  }, 600_000); /* 10 min for all 5x3 evals */
});

/**
 * Per-question per-model test cases. These give finer-grained failure
 * attribution than the aggregate test above.
 */
describe.skipIf(!hasApiKey())('LLM eval: per-question results', () => {
  if (!hasApiKey()) return;

  const apiKey = process.env[API_KEY_ENV] as string;

  for (const model of EVAL_MODELS) {
    for (const question of QUESTIONS) {
      it(`${model.label}: ${question.id}`, async () => {
        const { runOne } = await import('../../eval/runner/runner.js');
        const result = await runOne(model, question, apiKey, LOG_DIR);
        process.stdout.write(
          `  ${model.label.padEnd(28)} ${question.id.padEnd(40)} ` +
            `tool=${result.score.toolSelected ? '✓' : '✗'} ` +
            `schema=${result.score.schemaValid ? '✓' : '✗'} ` +
            `content=${result.score.contentCorrect ? '✓' : '✗'} ` +
            `(${result.score.reason})\n`,
        );
        /* Soft check: we want the surface to work; we don't fail on
         * individual model regressions here. The aggregate test above
         * is the pass/fail gate. */
        expect(result.score.toolSelected).toBe(true);
      }, 120_000);
    }
  }
});
