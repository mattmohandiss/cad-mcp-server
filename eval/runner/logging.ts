import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScenarioMeta, ScenarioResult } from './types.js';

export function writeScenarioLog(
  logDir: string,
  scenario: ScenarioMeta,
  result: ScenarioResult,
  transcript: string,
): void {
  fs.mkdirSync(logDir, { recursive: true });

  const slug = `${scenario.id}__${result.modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  fs.writeFileSync(
    path.join(logDir, `${slug}.json`),
    JSON.stringify(
      {
        scenarioId: scenario.id,
        modelId: result.modelId,
        prompt: scenario.prompt,
        field: scenario.field,
        expected: result.expected,
        extracted: result.extracted,
        correct: result.correct,
        score: result.score,
        reason: result.reason,
        text: result.text,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        usage: result.usage,
        steps: result.steps,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  if (transcript) fs.writeFileSync(path.join(logDir, `${slug}.md`), transcript);
  writeSummary(logDir, result);
}

function writeSummary(logDir: string, result: ScenarioResult): void {
  const summaryPath = path.join(logDir, 'summary.json');
  const summary: Record<string, unknown> = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    : {};

  summary[`${result.scenarioId}/${result.modelId}`] = {
    pass: result.correct,
    score: result.score,
    expected: result.expected,
    extracted: result.extracted,
    reason: result.reason,
    cost: result.usage?.cost,
    generationId: result.usage?.generationId,
    providerName: result.usage?.providerName,
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}
