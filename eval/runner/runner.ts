/**
 * Eval runner: runs a question through a model via OpenRouter,
 * simulating a real CAD-mcp-server session.
 *
 * The runner:
 *   1. Sends the question to the LLM with the 4 tool definitions
 *   2. Loops: LLM responds, may call tools, runner executes them
 *      against the in-process tool handlers (reuses the same logic
 *      as the real MCP server), feeds results back to the LLM
 *   3. Continues until the LLM responds without a tool call, or
 *      until MAX_TURNS is reached
 *   4. Extracts the answer via the question's `extract` function
 *   5. Scores against ground truth
 *
 * No real MCP server is started. The runner directly invokes the
 * `handle*` functions in src/tools/. This is faster, deterministic,
 * and avoids spawning a stdio subprocess per question.
 */

import { z } from 'zod';
import * as path from 'node:path';
import { chatCompletion, zodToOpenAITool, type ChatMessage, type ToolCall } from './openrouter.js';
import { EVAL_MODELS, type EvalModel } from './model-registry.js';
import { QUESTIONS, type EvalQuestion } from './questions.js';
import { scoreAnswer, type ScoreResult } from './scoring.js';
import { inspectStepInput, handleInspectStep } from '../../src/tools/inspect.js';
import { queryStepInput, handleQueryStep } from '../../src/tools/query.js';
import { diffStepInput, handleDiffStep } from '../../src/tools/diff.js';
import { transactStepInput, handleTransactStep } from '../../src/tools/transact.js';
import { wrapTool } from '../../src/tools/shared.js';
import { toolExamples } from '../../src/schemas/examples.js';

const REPO_ROOT = process.cwd();

/* OpenAI tool definitions built from the Zod schemas. */
const TOOL_DEFS = [
  zodToOpenAITool('inspect_step', inspectStepInput.description ?? '', inspectStepInput),
  zodToOpenAITool('query_step', queryStepInput.description ?? '', queryStepInput),
  zodToOpenAITool('diff_step', diffStepInput.description ?? '', diffStepInput),
  zodToOpenAITool('transact_step', transactStepInput.description ?? '', transactStepInput),
];

const SYSTEM_PROMPT = `You are an AI assistant with access to a 4-tool surface for inspecting STEP CAD files. The tools are:
- inspect_step: model-level summary (bbox, watertight, topology, validity, XDE)
- query_step: declarative query (filter, group, measure, aggregate over faces/edges/bodies/pmi/etc.)
- diff_step: compare two STEP files
- transact_step: imperative pipeline for multi-step workflows

Pick the right tool for the question. The first 1-2 example inputs in the tool definitions illustrate the schema. Keep tool calls precise; return concrete answers (numbers, yes/no). Do not write code; just call tools.

The query_step tool can do most inspections. It accepts a filter object with fields like surface_type, area_min/max, length_min/max, body_ids, etc. Group results with group_by: ['axis', 'surface_type', 'normal_direction', ...]. Measure results with measure: [{op: 'ray_test', direction: [0,0,1]}, {op: 'distance', to: 'face:5'}]. Aggregate with aggregate: ['min:area', 'count:hit_distance', 'avg:length'].`;

const MAX_TURNS = 8;

export interface RunResult {
  questionId: string;
  model: EvalModel;
  score: ScoreResult;
  turns: number;
  totalTokens: number;
  durationMs: number;
  toolNames: string[];
}

export interface RunnerOptions {
  apiKey: string;
  questions?: EvalQuestion[];
  models?: EvalModel[];
  logDir?: string;
}

/**
 * Run a single question against a single model. Returns the score and
 * a transcript (saved to logDir if provided).
 */
export async function runOne(
  model: EvalModel,
  question: EvalQuestion,
  apiKey: string,
  logDir?: string,
): Promise<RunResult> {
  const start = Date.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question.prompt },
  ];
  const allToolCalls: ToolCall[] = [];
  const allToolResults: string[] = [];
  const toolNamesUsed: string[] = [];
  let totalTokens = 0;
  let toolSelected = false;
  let schemaValid = true;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await chatCompletion(apiKey, {
      model: model.openrouterId,
      messages,
      tools: TOOL_DEFS,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 2048,
    });
    if (response.usage) totalTokens += response.usage.total_tokens;
    const assistant = response.choices[0]?.message;
    if (!assistant) break;
    messages.push({
      role: 'assistant',
      content: assistant.content ?? '',
      ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}),
    });
    if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
      /* Final response: no more tool calls. */
      break;
    }
    /* Execute each tool call. */
    for (const call of assistant.tool_calls) {
      allToolCalls.push(call);
      toolNamesUsed.push(call.function.name);
      if (call.function.name === 'inspect_step' || call.function.name === 'query_step' || call.function.name === 'diff_step' || call.function.name === 'transact_step') {
        toolSelected = true;
      }
      const result = await executeToolCall(call);
      allToolResults.push(result);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  const extracted = question.extract(allToolCalls, allToolResults);
  const score = scoreAnswer(question, extracted, toolSelected, schemaValid);
  const duration = Date.now() - start;
  const result: RunResult = {
    questionId: question.id,
    model,
    score,
    turns: allToolCalls.length,
    totalTokens,
    durationMs: duration,
    toolNames: toolNamesUsed,
  };

  if (logDir) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(logDir, { recursive: true });
    const safeModel = model.openrouterId.replace(/[^a-z0-9]+/gi, '_');
    const logPath = path.join(logDir, `${question.id}__${safeModel}.json`);
    writeFileSync(
      logPath,
      JSON.stringify(
        { result, messages, toolCalls: allToolCalls, toolResults: allToolResults },
        null,
        2,
      ),
    );
  }

  return result;
}

/**
 * Execute a single tool call against the real cad-mcp-server handlers.
 * Returns the JSON-serialized result.
 */
async function executeToolCall(call: ToolCall): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return JSON.stringify({ ok: false, error: { type: 'invalid_input', message: 'arguments are not valid JSON' } });
  }

  try {
    let result: unknown;
    switch (call.function.name) {
      case 'inspect_step': {
        const a = args as { file_path?: string };
        if (!a.file_path) return errorResult('missing file_path');
        const wrapped = await handleInspectStep({ file_path: a.file_path } as never);
        result = unwrap(wrapped);
        break;
      }
      case 'query_step': {
        const a = args as Record<string, unknown>;
        if (!a.file_path) return errorResult('missing file_path');
        const wrapped = await handleQueryStep(a as never);
        result = unwrap(wrapped);
        break;
      }
      case 'diff_step': {
        const a = args as { baseline_file_path?: string; comparison_file_path?: string };
        if (!a.baseline_file_path || !a.comparison_file_path) {
          return errorResult('missing baseline_file_path or comparison_file_path');
        }
        const wrapped = await handleDiffStep({
          baseline_file_path: a.baseline_file_path,
          comparison_file_path: a.comparison_file_path,
        } as never);
        result = unwrap(wrapped);
        break;
      }
      case 'transact_step': {
        const a = args as Record<string, unknown>;
        if (!a.file_path) return errorResult('missing file_path');
        const wrapped = await handleTransactStep(a as never);
        result = unwrap(wrapped);
        break;
      }
      default:
        return errorResult(`unknown tool: ${call.function.name}`);
    }
    return JSON.stringify({ ok: true, data: result });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        type: 'execution_error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function unwrap(wrapped: unknown): unknown {
  if (wrapped && typeof wrapped === 'object' && 'ok' in wrapped) {
    const r = wrapped as { ok: boolean; data?: unknown; error?: { message: string } };
    if (r.ok) return r.data;
    return { error: r.error?.message ?? 'unknown error' };
  }
  return wrapped;
}

function errorResult(message: string): string {
  return JSON.stringify({ ok: false, error: { type: 'invalid_input', message } });
}

/* ------------------------------------------------------------------ */
/*  Bulk runner                                                         */
/* ------------------------------------------------------------------ */

export interface BulkResult {
  results: RunResult[];
  perModel: Record<string, { pass: number; total: number }>;
  perQuestion: Record<string, { pass: number; total: number }>;
  overall: { pass: number; total: number; pct: number };
}

export async function runAll(options: RunnerOptions): Promise<BulkResult> {
  const questions = options.questions ?? QUESTIONS;
  const models = options.models ?? EVAL_MODELS;
  const results: RunResult[] = [];

  for (const model of models) {
    for (const question of questions) {
      const r = await runOne(model, question, options.apiKey, options.logDir);
      results.push(r);
    }
  }

  /* Aggregate. */
  const perModel: Record<string, { pass: number; total: number }> = {};
  const perQuestion: Record<string, { pass: number; total: number }> = {};
  let totalPass = 0;
  for (const r of results) {
    const passed = r.score.contentCorrect && r.score.toolSelected && r.score.schemaValid;
    if (passed) totalPass++;
    const m = perModel[r.model.label] ?? (perModel[r.model.label] = { pass: 0, total: 0 });
    m.total++;
    if (passed) m.pass++;
    const q = perQuestion[r.questionId] ?? (perQuestion[r.questionId] = { pass: 0, total: 0 });
    q.total++;
    if (passed) q.pass++;
  }

  return {
    results,
    perModel,
    perQuestion,
    overall: { pass: totalPass, total: results.length, pct: results.length === 0 ? 0 : totalPass / results.length },
  };
}

/* ------------------------------------------------------------------ */
/*  Pretty report                                                       */
/* ------------------------------------------------------------------ */

export function formatReport(bulk: BulkResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('CAD MCP LLM Eval Results');
  lines.push('===========================');
  lines.push('');
  lines.push('Per-model pass rate:');
  for (const [label, stats] of Object.entries(bulk.perModel)) {
    const pct = stats.total === 0 ? 0 : (stats.pass / stats.total) * 100;
    lines.push(`  ${label.padEnd(28)} ${stats.pass}/${stats.total}  (${pct.toFixed(1)}%)`);
  }
  lines.push('');
  lines.push('Per-question pass rate:');
  for (const [id, stats] of Object.entries(bulk.perQuestion)) {
    const pct = stats.total === 0 ? 0 : (stats.pass / stats.total) * 100;
    lines.push(`  ${id.padEnd(40)} ${stats.pass}/${stats.total}  (${pct.toFixed(1)}%)`);
  }
  lines.push('');
  const overall = bulk.overall;
  lines.push(`Overall: ${overall.pass}/${overall.total}  (${(overall.pct * 100).toFixed(1)}%)`);
  lines.push('');
  return lines.join('\n');
}

/* Reference toolExamples to keep the import side-effect explicit. */
void toolExamples;
