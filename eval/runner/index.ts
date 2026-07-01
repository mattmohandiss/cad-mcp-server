/**
 * eval/runner/index.ts — CLI entry for CAD MCP eval.
 *
 * Usage:
 *   npx tsx eval/runner/index.ts                                  # default models × all scenarios
 *   npx tsx eval/runner/index.ts -m anthropic/claude-sonnet-4-5   # one model
 *   npx tsx eval/runner/index.ts -s basic_volume                  # one scenario
 *   npx tsx eval/runner/index.ts -m openai/gpt-4o-mini -s box_volume
 *
 * Model IDs are Vercel AI Gateway identifiers in creator/model format.
 */

import { DEFAULT_LOG_DIR, DEFAULT_MODELS, loadEvalEnv } from './config.js';
import { formatReport, runAll } from './runner.js';

function resolveItems(args: string[], flags: string[]): string[] | undefined {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (flags.includes(args[i]) && i + 1 < args.length) out.push(args[++i]);
  }
  return out.length > 0 ? out : undefined;
}

async function main() {
  loadEvalEnv();

  const args = process.argv.slice(2);
  const models = resolveItems(args, ['-m', '--model']) ?? DEFAULT_MODELS;
  const scenarioIds = resolveItems(args, ['-s', '--scenario']);

  console.log(`Models (${models.length}):   ${models.join(', ')}`);
  if (scenarioIds) console.log(`Scenarios (${scenarioIds.length}): ${scenarioIds.join(', ')}`);

  const bulk = await runAll({ models, scenarioIds, logDir: DEFAULT_LOG_DIR });
  console.log(formatReport(bulk));

  if (bulk.overall.pass < bulk.overall.total) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
