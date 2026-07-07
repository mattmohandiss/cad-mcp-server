import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScenarioMeta, ScenarioResult } from './types.js';

export function writeScenarioLog(
  logDir: string,
  scenario: ScenarioMeta,
  result: ScenarioResult,
): void {
  fs.mkdirSync(logDir, { recursive: true });

  const slug = `${scenario.id}__${result.modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Machine-readable full trace
  fs.writeFileSync(path.join(logDir, `${slug}.json`), JSON.stringify(result.trace, null, 2));

  // Human-readable transcript
  fs.writeFileSync(path.join(logDir, `${slug}.md`), buildMarkdownTranscript(scenario, result));
}

function formatForDisplay(v: unknown): string {
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return JSON.stringify(v, null, 2);
}

function buildMarkdownTranscript(scenario: ScenarioMeta, result: ScenarioResult): string {
  const t = result.trace;
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────
  lines.push(`# ${t.scenarioId}`, '');

  lines.push('## Metadata', '');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Model | \`${t.modelId}\` |`);
  lines.push(`| Scenario | \`${t.scenarioId}\` |`);
  lines.push(`| Field | \`${scenario.field}\` |`);
  lines.push(`| Tolerance | ${scenario.tolerance} |`);
  lines.push(`| Date | ${t.timestamp} |`);
  lines.push(`| Duration | ${(t.durationMs / 1000).toFixed(1)}s |`);
  lines.push(`| Total tokens | ${t.totalTokens.toLocaleString()} |`);
  if (t.cost !== undefined) lines.push(`| Cost | $${t.cost.toFixed(6)} |`);
  lines.push(`| Result | ${result.correct ? '✓ PASS' : '✗ FAIL'} |`);
  lines.push('');

  if (t.error) {
    lines.push('## Error', '');
    lines.push('```', t.error, '```', '');
    return lines.join('\n');
  }

  // ── Scenario prompt ─────────────────────────────────────────────────
  lines.push('## Prompt', '');
  lines.push(t.prompt);
  lines.push('');

  // ── Conversation ─────────────────────────────────────────────────────
  lines.push('## Conversation', '');

  for (const span of t.spans) {
    const perf = span.performance;
    const perfStr = `${(perf.durationMs / 1000).toFixed(1)}s`;
    const tokenStr = `${perf.inputTokens + perf.outputTokens} tok`;
    const checksStr = `argsValid=${span.checks.argsValid} productive=${span.checks.productive}`;

    lines.push(
      `### Step ${span.step}: \`${span.toolName}\` (${span.type}) — ${perfStr}, ${tokenStr}`,
      '',
      `**Checks:** ${checksStr}`,
      '',
    );

    if (span.reasoning) {
      lines.push('**Reasoning:**', '', span.reasoning, '', '---', '');
    }

    lines.push('**Args:**', '```json', formatForDisplay(span.toolArgs), '```', '');

    lines.push('**Output:**', '```json', formatForDisplay(span.toolOutput.raw), '```', '');

    lines.push('', '---', '');
  }

  // ── Answer & Field Results ───────────────────────────────────────────
  lines.push('## Answer', '');
  if (t.answer.extracted !== null) {
    lines.push('**Extracted:**', '```json', JSON.stringify(t.answer.extracted, null, 2), '```', '');
  }
  if (t.answer.expected !== null) {
    lines.push('**Expected:**', '```json', JSON.stringify(t.answer.expected, null, 2), '```', '');
  }
  lines.push(`**Match:** ${t.answer.match}`, '');

  lines.push('## Field Results', '');
  lines.push('| Field | Result | Expected | Got |');
  lines.push('|-------|--------|----------|-----|');
  for (const field of result.fieldResults) {
    lines.push(
      `| ${field.path} | ${field.match ? 'PASS' : 'FAIL'} | ${inlineJson(field.expected)} | ${inlineJson(field.extracted)} |`,
    );
  }
  lines.push('');
  lines.push(`**Reason:** ${result.reason}`);
  lines.push('');
  lines.push(
    `**${t.spans.length} spans, ${t.totalTokens.toLocaleString()} tokens, ${(t.durationMs / 1000).toFixed(1)}s**`,
    '',
  );

  return lines.join('\n');
}

function inlineJson(value: unknown): string {
  return `\`${JSON.stringify(value)}\``;
}
