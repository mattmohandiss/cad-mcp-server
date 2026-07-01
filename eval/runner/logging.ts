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

  // Write full trace (untruncated, machine-readable)
  fs.writeFileSync(path.join(logDir, `${slug}.json`), JSON.stringify(result.trace, null, 2));

  // Write human-readable transcript
  const md = buildMarkdownTranscript(scenario, result);
  fs.writeFileSync(path.join(logDir, `${slug}.md`), md);
}

function buildMarkdownTranscript(scenario: ScenarioMeta, result: ScenarioResult): string {
  const lines = [`## User\n\n${scenario.prompt}\n`];

  for (const span of result.trace.spans) {
    if (span.reasoning) {
      lines.push(`## Reasoning\n\n${span.reasoning}\n`);
    }

    lines.push(
      `### Step ${span.step}: \`${span.toolName}\` (${span.type})`,
      '',
      '**Args:**',
      '```json',
      JSON.stringify(span.toolArgs, null, 2),
      '```',
      '',
      '**Output:**',
      '```json',
      JSON.stringify(span.toolOutput.raw, null, 2),
      '```',
      '',
      `**Checks:** argsValid=${span.checks.argsValid} productive=${span.checks.productive}`,
      '',
    );
  }

  if (result.trace.answer.extracted !== null) {
    lines.push(
      `## Answer (step ${result.trace.answer.sourceStep})`,
      '',
      '```json',
      JSON.stringify(result.trace.answer.extracted, null, 2),
      '```',
      '',
    );
  }

  lines.push(
    `## Score`,
    '',
    `- composite: ${result.compositeScore}`,
    `- toolCorrect: ${result.checks.toolCorrect}`,
    `- pathEfficient: ${result.checks.pathEfficient}`,
    `- fieldExtraction: ${result.checks.fieldExtraction}`,
    `- argsValid: ${result.checks.argsValid}`,
    `- reason: ${result.reason}`,
    '',
    `**${result.trace.spans.length} spans, ${result.trace.totalTokens} tokens, ${result.trace.durationMs}ms**`,
    '',
  );

  return lines.join('\n');
}
