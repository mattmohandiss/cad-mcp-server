/**
 * LLM eval test (vitest wrapper).
 *
 * Drives the real MCP server subprocess via @ai-sdk/mcp against
 * OpenRouter. One env var: OPENROUTER_API_KEY.
 * Skipped when unset (so CI stays green).
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { EVAL_MODELS } from '../../eval/runner/model-registry.js';
import { QUESTIONS } from '../../eval/runner/questions.js';
import { runAll, formatReport } from '../../eval/runner/runner.js';

const LOG_DIR = path.join(process.cwd(), 'tests', 'eval-logs');

function hasApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

describe.skipIf(!hasApiKey())('LLM eval: 4-tool surface across providers', () => {
  if (!hasApiKey()) return;

  it('runs all questions across all models and reports a per-model pass rate', async () => {
    const bulk = await runAll({ logDir: LOG_DIR });
    process.stdout.write(formatReport(bulk));

    expect(bulk.overall.total).toBeGreaterThan(0);
    expect(bulk.overall.pass).toBeGreaterThan(0);
  }, 600_000);
});

describe.skipIf(!hasApiKey())('LLM eval: per-question per-model', () => {
  if (!hasApiKey()) return;

  for (const model of EVAL_MODELS) {
    for (const question of QUESTIONS) {
      it(`${model.label}: ${question.id}`, async () => {
        const { runOne } = await import('../../eval/runner/runner.js');
        const result = await runOne(model, question, LOG_DIR);
        process.stdout.write(
          `  ${model.label.padEnd(28)} ${question.id.padEnd(40)} ` +
            `${result.correct ? '✓' : '✗'} extracted=${JSON.stringify(result.extracted)} ` +
            `expected=${JSON.stringify(result.expected)} (${result.reason})\n`,
        );
        expect(result.toolCalls.length).toBeGreaterThan(0);
      }, 120_000);
    }
  }
});