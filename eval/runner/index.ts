#!/usr/bin/env node
/**
 * CLI: run the LLM eval against models × questions.
 *
 * Reads OPENROUTER_API_KEY from eval/.env automatically.
 *
 * Examples:
 *   npx tsx eval/runner/index.ts                          # all models × all questions
 *   npx tsx eval/runner/index.ts --model sonnet            # just Claude
 *   npx tsx eval/runner/index.ts --model gpt --model gemini # two models
 *   npx tsx eval/runner/index.ts --question box_volume     # just one question
 *   npx tsx eval/runner/index.ts -m sonnet -q box_volume   # one model × one question
 */

import { runAll, formatReport } from './runner.js';
import { EVAL_MODELS } from './model-registry.js';
import { QUESTIONS } from './questions.js';

const SHORTCUTS: Record<string, string> = {
  sonnet: 'Claude Sonnet 4.5',
  claude: 'Claude Sonnet 4.5',
  gpt: 'GPT-4o-mini',
  gpt4o: 'GPT-4o-mini',
  gemini: 'Gemini 2.5 Flash',
  flash: 'Gemini 2.5 Flash',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const modelLabels: string[] = [];
  const questionIds: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' || args[i] === '-m') {
      const val = args[++i];
      if (!val) throw new Error('--model requires a value');
      modelLabels.push(SHORTCUTS[val.toLowerCase()] ?? val);
    } else if (args[i] === '--question' || args[i] === '-q') {
      const val = args[++i];
      if (!val) throw new Error('--question requires a value');
      questionIds.push(val);
    } else {
      throw new Error(`Unknown flag: ${args[i]}. Use --model / -m and --question / -q`);
    }
  }

  const models = modelLabels.length > 0
    ? EVAL_MODELS.filter((m) => modelLabels.includes(m.label))
    : EVAL_MODELS;
  const questions = questionIds.length > 0
    ? QUESTIONS.filter((q) => questionIds.includes(q.id))
    : QUESTIONS;

  if (models.length === 0) {
    throw new Error(`No models matched. Available: ${EVAL_MODELS.map((m) => `${m.label} (--model ${m.label.split(' ')[0].toLowerCase()})`).join(', ')}`);
  }
  if (questions.length === 0) {
    throw new Error(`No questions matched. Available: ${QUESTIONS.map((q) => q.id).join(', ')}`);
  }

  return { models, questions };
}

async function main() {
  const { models, questions } = parseArgs();

  process.stdout.write(`Models (${models.length}):   ${models.map((m) => m.label).join(', ')}\n`);
  process.stdout.write(`Questions (${questions.length}): ${questions.map((q) => q.id).join(', ')}\n\n`);

  const bulk = await runAll({ models, questions, logDir: 'tests/eval-logs' });

  process.stdout.write(formatReport(bulk));

  const fail = bulk.overall.total - bulk.overall.pass;
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Eval failed: ${err}\n`);
  process.exit(1);
});