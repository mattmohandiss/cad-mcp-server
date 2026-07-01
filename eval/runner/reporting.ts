import { shortModelName } from './util.js';
import type { BulkResult, ScenarioResult } from './types.js';

export function formatRunLine(result: ScenarioResult): string {
  const model = shortModelName(result.modelId).padEnd(25);
  const icon = result.correct ? '✓' : '✗';
  const score = String(result.compositeScore).padStart(3);
  const scenario = result.scenarioId.padEnd(25);
  const calls = `${result.trace.spans.length} calls`.padEnd(8);
  const time = `${(result.durationMs / 1000).toFixed(1)}s`.padStart(6);

  const tokens =
    result.trace.totalTokens > 0
      ? `${formatTokenCount(result.trace.totalTokens)}`.padStart(12)
      : '—'.padStart(12);

  const spanTypes = [
    result.trace.spans.filter((s) => s.type === 'discovery').length || '',
    result.trace.spans.filter((s) => s.type === 'measurement').length || '',
    result.trace.spans.filter((s) => s.type === 'distraction').length || '',
  ]
    .map((c) => String(c).padStart(2))
    .join('/');

  return `${icon} ${score}  ${scenario} ${model} ${calls} ${time} ${tokens}  [D/M/W:${spanTypes}]  ${result.reason}`;
}

export function summarizeResults(results: ScenarioResult[], durationMs: number): BulkResult {
  const perModel: Record<string, { pass: number; total: number; avgComposite: number }> = {};
  const perScenario: Record<string, { pass: number; total: number }> = {};
  let totalPass = 0;
  let totalRuns = 0;
  let totalComposite = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const modelMeta: Record<string, { tokens: number; cost: number }> = {};

  for (const r of results) {
    perModel[r.modelId] ??= { pass: 0, total: 0, avgComposite: 0 };
    perModel[r.modelId].total++;
    perModel[r.modelId].avgComposite += r.compositeScore;
    if (r.correct) perModel[r.modelId].pass++;
    totalPass += r.correct ? 1 : 0;
    totalRuns++;
    totalComposite += r.compositeScore;

    perScenario[r.scenarioId] ??= { pass: 0, total: 0 };
    perScenario[r.scenarioId].total++;
    if (r.correct) perScenario[r.scenarioId].pass++;

    totalTokens += r.trace.totalTokens;
    totalCost += r.usage?.cost ?? 0;

    const mn = shortModelName(r.modelId);
    modelMeta[mn] ??= { tokens: 0, cost: 0 };
    modelMeta[mn].tokens += r.trace.totalTokens;
    modelMeta[mn].cost += r.usage?.cost ?? 0;
  }

  // Average the composite scores
  for (const m of Object.keys(perModel)) {
    if (perModel[m].total > 0) {
      perModel[m].avgComposite = Math.round(perModel[m].avgComposite / perModel[m].total);
    }
  }

  return {
    results,
    perModel,
    perScenario,
    overall: {
      pass: totalPass,
      total: totalRuns,
      pct: totalRuns > 0 ? Math.round((totalPass / totalRuns) * 100) : 0,
      avgComposite: totalRuns > 0 ? Math.round(totalComposite / totalRuns) : 0,
    },
    _meta: {
      modelMeta,
      totalTokens,
      totalCost,
      durationMs,
    },
  };
}

export function formatReport(result: BulkResult): string {
  const lines: string[] = [
    '',
    'CAD MCP Eval Results',
    '===================',
    '',
    'Model              Pass Rate  Avg Comp  Tokens      Cost',
    '---------------------------------------------------------',
  ];

  for (const [modelId, meta] of Object.entries(result.perModel)) {
    const mn = shortModelName(modelId).padEnd(20);
    const pct = `${((meta.pass / meta.total) * 100).toFixed(0)}%`.padStart(5);
    const avg = String(meta.avgComposite).padStart(9);
    const tokens = formatTokenCount(result._meta.modelMeta[mn]?.tokens ?? 0).padStart(10);
    const cost = `$${formatCost(result._meta.modelMeta[mn]?.cost ?? 0)}`.padStart(8);
    lines.push(`${mn}        ${pct}  ${avg}  ${tokens}  ${cost}`);
  }

  lines.push('---------------------------------------------------------');
  lines.push(
    `Overall        ${String(result.overall.pct).padStart(3)}%     ${String(result.overall.avgComposite).padStart(9)}  ${formatTokenCount(result._meta.totalTokens).padStart(10)}  $${formatCost(result._meta.totalCost)}`,
  );
  lines.push('');
  lines.push('Scenario                          Pass Rate');
  lines.push('---------------------------------------------');

  for (const [scenario, meta] of Object.entries(result.perScenario)) {
    const label = scenario.padEnd(32);
    const rate = `${meta.pass}/${meta.total}  (${((meta.pass / meta.total) * 100).toFixed(0)}%)`;
    lines.push(`${label} ${rate}`);
  }

  lines.push('');
  lines.push(
    `Duration: ${(result._meta.durationMs / 1000).toFixed(1)}s    ${result.results.length} runs    $${formatCost(result._meta.totalCost)}`,
  );

  return lines.join('\n');
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return '0.000000';
  return n.toFixed(6);
}
