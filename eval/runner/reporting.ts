import type { BulkResult, ScenarioResult } from './types.js';
import { shortModelName } from './util.js';

export function summarizeResults(results: ScenarioResult[], durationMs: number): BulkResult {
  const perModel: BulkResult['perModel'] = {};
  const perScenario: BulkResult['perScenario'] = {};
  const modelMeta: BulkResult['_meta']['modelMeta'] = {};
  let pass = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const result of results) {
    if (result.correct) pass++;

    const model = shortModelName(result.modelId);
    perModel[model] ??= { pass: 0, total: 0 };
    perModel[model].total++;
    if (result.correct) perModel[model].pass++;

    modelMeta[model] ??= { scoreSum: 0, tokens: 0, cost: 0 };
    modelMeta[model].scoreSum += result.score;
    modelMeta[model].tokens += result.usage?.totalTokens ?? 0;
    modelMeta[model].cost += result.usage?.cost ?? 0;

    perScenario[result.scenarioId] ??= { pass: 0, total: 0 };
    perScenario[result.scenarioId].total++;
    if (result.correct) perScenario[result.scenarioId].pass++;

    totalTokens += result.usage?.totalTokens ?? 0;
    totalCost += result.usage?.cost ?? 0;
  }

  return {
    results,
    perModel,
    perScenario,
    overall: { pass, total: results.length, pct: results.length ? pass / results.length : 0 },
    _meta: { modelMeta, totalTokens, totalCost, durationMs },
  };
}

export function formatRunLine(result: ScenarioResult): string {
  const status = result.correct ? '✓' : '✗';
  const duration = `${(result.durationMs / 1000).toFixed(1)}s`;
  const tokens = result.usage
    ? `${formatTokenCount(result.usage.inputTokens)}/${formatTokenCount(result.usage.outputTokens)}`
    : '—';
  const cost = result.usage?.cost != null ? `$${result.usage.cost.toFixed(6)}` : '';
  const calls = result.toolCalls.length;
  const callText =
    calls === 0 && result.durationMs < 2_000 ? 'SKIP' : `${calls} call${calls !== 1 ? 's' : ''}`;

  return `${status} ${String(result.score).padStart(3)}  ${result.scenarioId.padEnd(24)}  ${shortModelName(result.modelId).padEnd(24)}  ${callText.padEnd(8)} ${duration.padEnd(6)} ${tokens.padEnd(14)} ${cost.padEnd(14)} ${result.reason.slice(0, 80)}`;
}

export function formatReport(bulk: BulkResult): string {
  const lines: string[] = ['', 'CAD MCP Eval Results', '===================', ''];
  const { modelMeta, totalTokens, totalCost, durationMs } = bulk._meta;

  lines.push('Model              Pass Rate  Avg Score  Tokens      Cost');
  lines.push('---------------------------------------------------------');
  for (const [label, stats] of Object.entries(bulk.perModel).sort()) {
    const avg = stats.total > 0 ? modelMeta[label].scoreSum / stats.total : 0;
    const pct = `${((stats.pass / stats.total) * 100).toFixed(1)}%`;
    lines.push(
      `${label.padEnd(20)} ${pct.padStart(6)}     ${avg.toFixed(1).padStart(4)}    ${formatTokenCount(modelMeta[label].tokens).padStart(10)} $${modelMeta[label].cost.toFixed(6).padStart(11)}`,
    );
  }

  lines.push('---------------------------------------------------------');
  const avgScore = bulk.results.length
    ? bulk.results.reduce((sum, result) => sum + result.score, 0) / bulk.results.length
    : 0;
  const overallPct = `${(bulk.overall.pct * 100).toFixed(1)}%`;
  lines.push(
    `${'Overall'.padEnd(20)} ${overallPct.padStart(6)}     ${avgScore.toFixed(1).padStart(4)}    ${formatTokenCount(totalTokens).padStart(10)} $${totalCost.toFixed(6)}`,
  );
  lines.push('');

  lines.push('Scenario                          Pass Rate');
  lines.push('---------------------------------------------');
  for (const [id, stats] of Object.entries(bulk.perScenario).sort()) {
    lines.push(
      `${id.padEnd(34)} ${stats.pass}/${stats.total}  (${((stats.pass / stats.total) * 100).toFixed(1)}%)`,
    );
  }

  lines.push(
    '',
    `Duration: ${(durationMs / 1000).toFixed(1)}s    ${bulk.results.length} runs    $${totalCost.toFixed(6)}`,
    '',
  );
  return lines.join('\n');
}

function formatTokenCount(value: number | undefined): string {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}
