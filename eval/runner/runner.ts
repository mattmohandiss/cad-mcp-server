import { assertGatewayAuth, DEFAULT_MODELS } from './config.js';
import { runModelWithMcp } from './ai.js';
import { writeScenarioLog } from './logging.js';
import { formatRunLine, summarizeResults } from './reporting.js';
import { buildAnswerSchema, compareAnswer, computeScore } from './scoring.js';
import { generateGroundTruth, loadScenarios } from './scenarios.js';
import type { BulkResult, ScenarioMeta, ScenarioResult } from './types.js';

export interface RunAllOptions {
  models?: readonly string[];
  scenarioIds?: readonly string[];
  logDir?: string;
}

export async function runOne(
  modelId: string,
  scenario: ScenarioMeta,
  logDir?: string,
): Promise<ScenarioResult> {
  assertGatewayAuth();
  const start = Date.now();

  const generated = generateGroundTruth(scenario);
  if (!generated.ok) {
    return failResult(scenario, modelId, `SKIP: ${generated.error}`, Date.now() - start);
  }

  const generatedScenario = generated.scenario;
  const expected = generated.groundTruth[scenario.field];
  const modelRun = await runModelWithMcp(
    modelId,
    generatedScenario,
    buildAnswerSchema(scenario.field, expected),
  );
  const extracted = modelRun.output?.[scenario.field] ?? null;
  const matched = modelRun.ok && compareAnswer(extracted, expected, scenario.tolerance);
  const score = computeScore(extracted, expected, scenario.tolerance, matched);
  const reason = buildReason(
    modelRun.ok ? null : modelRun.error,
    scenario.field,
    expected,
    extracted,
    matched,
  );

  const result: ScenarioResult = {
    scenarioId: scenario.id,
    modelId,
    field: scenario.field,
    expected,
    extracted,
    score,
    correct: matched,
    reason,
    text: modelRun.text,
    finishReason: modelRun.finishReason,
    toolCalls: modelRun.toolCalls,
    toolResults: modelRun.toolResults,
    usage: modelRun.usage,
    steps: modelRun.steps,
    durationMs: Date.now() - start,
  };

  if (logDir) writeScenarioLog(logDir, generatedScenario, result, modelRun.transcript);
  return result;
}

export async function runAll(options: RunAllOptions = {}): Promise<BulkResult> {
  const startedAt = Date.now();
  const models = [...(options.models ?? DEFAULT_MODELS)];
  const scenarios = loadScenarios().filter(
    (scenario) => !options.scenarioIds || options.scenarioIds.includes(scenario.id),
  );
  const results: ScenarioResult[] = [];

  for (const modelId of models) {
    for (const scenario of scenarios) {
      const result = await runOne(modelId, scenario, options.logDir);
      results.push(result);
      process.stdout.write(`${formatRunLine(result)}\n`);
    }
  }

  return summarizeResults(results, Date.now() - startedAt);
}

function failResult(
  scenario: ScenarioMeta,
  modelId: string,
  reason: string,
  durationMs: number,
): ScenarioResult {
  return {
    scenarioId: scenario.id,
    modelId,
    field: scenario.field,
    expected: null,
    extracted: null,
    score: 0,
    correct: false,
    reason,
    text: '',
    finishReason: '',
    toolCalls: [],
    toolResults: [],
    usage: null,
    steps: [],
    durationMs,
  };
}

function buildReason(
  error: string | null,
  field: string,
  expected: unknown,
  extracted: unknown,
  matched: boolean,
): string {
  if (error) return `error: ${error.slice(0, 160)}`;
  if (extracted === null || extracted === undefined) return `missing field "${field}"`;
  if (matched)
    return `match (expected=${JSON.stringify(expected)}, got=${JSON.stringify(extracted)})`;
  return `mismatch (expected=${JSON.stringify(expected)}, got=${JSON.stringify(extracted)})`;
}

export { DEFAULT_MODELS } from './config.js';
export { formatReport } from './reporting.js';
export { loadScenarios } from './scenarios.js';
export type { BulkResult, ScenarioMeta, ScenarioResult } from './types.js';
