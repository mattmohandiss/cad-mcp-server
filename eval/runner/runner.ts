import { assertGatewayAuth, DEFAULT_MODELS } from './config.js';
import { runModelWithMcp } from './ai.js';
import { writeScenarioLog } from './logging.js';
import { formatRunLine, summarizeResults } from './reporting.js';
import { buildAnswerSchema, compareFields } from './scoring.js';
import { generateGroundTruth, loadScenarios } from './scenarios.js';
import type { BulkResult, EvalTrace, ScenarioMeta, ScenarioResult, UsageEntry } from './types.js';

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
    return {
      scenarioId: scenario.id,
      modelId,
      trace: {
        trace_version: 1,
        scenarioId: scenario.id,
        scenario: {
          field: scenario.field,
          tolerance: scenario.tolerance,
          files: { ...scenario.files },
        },
        modelId,
        prompt: scenario.prompt,
        answer: { extracted: null, expected: null, match: false, sourceStep: -1 },
        spans: [],
        totalTokens: 0,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        error: generated.error?.slice(0, 160) ?? 'ground truth generation failed',
      },
      field: scenario.field,
      expected: null,
      extracted: null,
      correct: false,
      fieldResults: [],
      reason: `SKIP: ${generated.error}`,
      finishReason: '',
      usage: null,
      durationMs: Date.now() - start,
    };
  }

  const generatedScenario = generated.scenario;
  const expected = generated.groundTruth[scenario.field];
  const modelRun = await runModelWithMcp(
    modelId,
    generatedScenario,
    buildAnswerSchema(scenario.field, expected),
  );

  if (!modelRun.ok || !modelRun.trace) {
    const rawTrace = modelRun.trace;
    return buildFailureScenarioResult(
      scenario,
      modelId,
      rawTrace,
      expected,
      modelRun.ok ? 'no trace produced' : modelRun.error,
      Date.now() - start,
    );
  }

  const trace = modelRun.trace;
  trace.answer.expected = expected;
  const fieldResults = compareFields(trace.answer.extracted, expected, scenario.tolerance);
  trace.answer.match = fieldResults.length > 0 && fieldResults.every((field) => field.match);
  const correct = trace.answer.match;

  const result: ScenarioResult = {
    scenarioId: scenario.id,
    modelId,
    trace,
    field: scenario.field,
    expected,
    extracted: trace.answer.extracted,
    correct,
    fieldResults,
    reason: buildReason(null, correct, expected, trace.answer.extracted),
    finishReason: trace.answer.match ? 'stop' : 'tool-calls',
    usage: buildUsageEntry(trace),
    durationMs: trace.durationMs,
  };

  if (logDir) writeScenarioLog(logDir, generatedScenario, result);
  return result;
}

export async function runAll(options: RunAllOptions = {}): Promise<BulkResult> {
  const startedAt = Date.now();
  const models = [...(options.models ?? DEFAULT_MODELS)];
  const allScenarios = loadScenarios();
  const scenarios = options.scenarioIds
    ? allScenarios.filter((scenario) => options.scenarioIds?.includes(scenario.id))
    : allScenarios;
  if (options.scenarioIds) {
    const knownIds = new Set(allScenarios.map((scenario) => scenario.id));
    const missing = options.scenarioIds.filter((id) => !knownIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown scenario ID(s): ${missing.join(', ')}`);
    }
  }
  if (scenarios.length === 0) {
    throw new Error('No eval scenarios selected');
  }
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

// ── Helpers ──────────────────────────────────────────────────────────

function buildReason(
  error: string | null,
  matched: boolean,
  expected: unknown,
  extracted: unknown,
): string {
  if (error) return `error: ${error.slice(0, 160)}`;
  if (extracted === null || extracted === undefined) return 'no answer produced';
  if (matched)
    return `match (expected=${JSON.stringify(expected)}, got=${JSON.stringify(extracted)})`;
  return `mismatch (expected=${JSON.stringify(expected)}, got=${JSON.stringify(extracted)})`;
}

function buildUsageEntry(trace: EvalTrace): UsageEntry {
  return {
    totalTokens: trace.totalTokens,
    cost: trace.cost,
    generationId: trace.generationId,
  };
}

function buildFailureScenarioResult(
  scenario: ScenarioMeta,
  modelId: string,
  trace: EvalTrace | null,
  expected: unknown,
  error: string,
  durationMs: number,
): ScenarioResult {
  const fallbackTrace: EvalTrace = trace ?? {
    trace_version: 1,
    scenarioId: scenario.id,
    scenario: {
      field: scenario.field,
      tolerance: scenario.tolerance,
      files: { ...scenario.files },
    },
    modelId,
    prompt: scenario.prompt,
    answer: { extracted: null, expected: null, match: false, sourceStep: -1 },
    spans: [],
    totalTokens: 0,
    durationMs,
    timestamp: new Date().toISOString(),
    error: error.slice(0, 160),
  };

  return {
    scenarioId: scenario.id,
    modelId,
    trace: fallbackTrace,
    field: scenario.field,
    expected,
    extracted: null,
    correct: false,
    fieldResults: [],
    reason: `error: ${error.slice(0, 160)}`,
    finishReason: '',
    usage: null,
    durationMs,
  };
}

export { DEFAULT_MODELS } from './config.js';
export { formatReport } from './reporting.js';
export { loadScenarios } from './scenarios.js';
export type { BulkResult, ScenarioMeta, ScenarioResult } from './types.js';
