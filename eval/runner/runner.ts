/**
 * Eval runner — drives the REAL MCP server via the @ai-sdk/mcp client
 * and the Vercel AI SDK against OpenRouter.
 *
 * For each (question, model):
 *   1. Start the MCP server as a subprocess (StdioClientTransport)
 *   2. Get the 4 tools via mcpClient.tools()
 *   3. generateText({ model, tools, messages })
 *   4. The AI SDK handles the agent loop: LLM calls tools → SDK
 *      executes them via the MCP client → results fed back → repeat
 *   5. result.text is the LLM's final answer
 *   6. Parse the answer and score against ground truth
 *
 * All models route through OpenRouter (OpenAI-compatible API).
 * One env var: OPENROUTER_API_KEY (loaded from eval/.env).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateText, isStepCount } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { EVAL_MODELS, type EvalModel } from './model-registry.js';
import { QUESTIONS, type EvalQuestion } from './questions.js';

/* Load OPENROUTER_API_KEY from eval/.env */
{
  const envPath = new URL('../../eval/.env', import.meta.url);
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('OPENROUTER_API_KEY=')) {
      const value = trimmed.slice('OPENROUTER_API_KEY='.length).replace(/^["']|["']$/g, '');
      if (!process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = value;
    }
  }
}

const SERVER_PATH = new URL('../../dist/index.js', import.meta.url).pathname;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface ToolCallEntry {
  name: string;
  args: string;
}

export interface ToolResultEntry {
  name: string;
  args: string;
  output: string;
}

export interface UsageEntry {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
  /** OpenRouter cost & provider-specific extras come through raw */
  raw?: Record<string, unknown>;
}

export interface StepSummaryEntry {
  stepNumber: number;
  text: string;
  toolCalls: ToolCallEntry[];
  finishReason: string;
  stepTimeMs: number;
  responseTimeMs: number;
  usage: { inputTokens: number | undefined; outputTokens: number | undefined; totalTokens: number | undefined };
}

export interface RunResult {
  questionId: string;
  modelLabel: string;
  toolCalls: ToolCallEntry[];
  toolResults: ToolResultEntry[];
  extracted: number | boolean | string | null;
  expected: number | boolean | string;
  correct: boolean;
  reason: string;
  text: string;
  finishReason: string;
  usage: UsageEntry | null;
  steps: StepSummaryEntry[];
  warnings: string[];
  durationMs: number;
}

export interface BulkResult {
  results: RunResult[];
  perModel: Record<string, { pass: number; total: number }>;
  perQuestion: Record<string, { pass: number; total: number }>;
  overall: { pass: number; total: number; pct: number };
}

/**
 * Run a single (question, model) pair through the real MCP server.
 */
export async function runOne(
  model: EvalModel,
  question: EvalQuestion,
  logDir?: string,
): Promise<RunResult> {
  const start = Date.now();

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
  });

  const mcp = await createMCPClient({ transport });
  const tools = await mcp.tools();
  const languageModel = openrouter(model.id);

  let result;
  try {
      result = await generateText({
      model: languageModel,
      tools,
      stopWhen: isStepCount(8),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question.prompt }],
    });
  } finally {
    await mcp.close();
  }

  const text = result.text ?? '';
  const finishReason = result.finishReason ?? '';
  const toolCalls: ToolCallEntry[] = (result.steps ?? []).flatMap((step) =>
    (step.toolCalls ?? []).map((tc) => ({
      name: tc.toolName,
      args: JSON.stringify(tc.input),
    })),
  );
  const toolResults: ToolResultEntry[] = (result.toolResults ?? []).map((tr) => ({
    name: tr.toolName,
    args: JSON.stringify(tr.input),
    output: truncate(JSON.stringify(tr.output), 2000),
  }));
  const usage: UsageEntry | null = result.usage
    ? {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        inputTokenDetails: result.usage.inputTokenDetails,
        outputTokenDetails: result.usage.outputTokenDetails,
        raw: mergeRawWithOpenRouterCost(result.usage.raw, result.providerMetadata),
      }
    : null;
  const steps: StepSummaryEntry[] = (result.steps ?? []).map((s) => ({
    stepNumber: s.stepNumber,
    text: s.text ?? '',
    toolCalls: (s.toolCalls ?? []).map((tc) => ({ name: tc.toolName, args: JSON.stringify(tc.input) })),
    finishReason: s.finishReason ?? '',
    stepTimeMs: (s.performance as Record<string, unknown>)?.stepTimeMs as number ?? 0,
    responseTimeMs: (s.performance as Record<string, unknown>)?.responseTimeMs as number ?? 0,
    usage: {
      inputTokens: s.usage?.inputTokens,
      outputTokens: s.usage?.outputTokens,
      totalTokens: s.usage?.totalTokens,
    },
  }));
  const warnings: string[] = (result.warnings ?? []).map((w) => String(w));

  const extracted = question.extract(text, toolCalls);
  const correct = compare(extracted, question);

  if (logDir) {
    writeLog(logDir, model, question, {
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
      steps,
      warnings,
      extracted,
      correct,
    });
  }

  return {
    questionId: question.id,
    modelLabel: model.label,
    toolCalls,
    toolResults,
    extracted,
    expected: question.expected.value,
    correct,
    reason: correct ? 'match' : extracted === null ? 'no extractable answer' : 'value mismatch',
    text,
    finishReason,
    usage,
    steps,
    warnings,
    durationMs: Date.now() - start,
  };
}

/**
 * Run all questions × all models.
 */
export async function runAll(
  options: { questions?: EvalQuestion[]; models?: EvalModel[]; logDir?: string } = {},
): Promise<BulkResult> {
  const questions = options.questions ?? QUESTIONS;
  const models = options.models ?? EVAL_MODELS;
  const results: RunResult[] = [];

  for (const model of models) {
    for (const question of questions) {
      const r = await runOne(model, question, options.logDir);
      results.push(r);
      process.stdout.write(
        `  ${model.label.padEnd(24)} ${question.id.padEnd(40)} ` +
          `${r.correct ? '✓' : '✗'} extracted=${JSON.stringify(r.extracted)} expected=${JSON.stringify(r.expected)}\n`,
      );
    }
  }

  const perModel: Record<string, { pass: number; total: number }> = {};
  const perQuestion: Record<string, { pass: number; total: number }> = {};
  let pass = 0;
  for (const r of results) {
    if (r.correct) pass++;
    perModel[r.modelLabel] ??= { pass: 0, total: 0 };
    perModel[r.modelLabel].total++;
    if (r.correct) perModel[r.modelLabel].pass++;
    perQuestion[r.questionId] ??= { pass: 0, total: 0 };
    perQuestion[r.questionId].total++;
    if (r.correct) perQuestion[r.questionId].pass++;
  }

  return {
    results,
    perModel,
    perQuestion,
    overall: { pass, total: results.length, pct: results.length === 0 ? 0 : pass / results.length },
  };
}

function compare(extracted: number | boolean | string | null, question: EvalQuestion): boolean {
  if (extracted === null) return false;
  if (typeof extracted !== typeof question.expected.value) return false;
  if (question.expected.kind === 'number') {
    const tol = question.expected.tolerance ?? 0.01;
    const diff = Math.abs((extracted as number) - (question.expected.value as number));
    if (diff < tol) return true;
    const denom = Math.max(Math.abs(extracted as number), Math.abs(question.expected.value as number), 1e-9);
    return diff / denom < 0.01;
  }
  return extracted === question.expected.value;
}

export function formatReport(bulk: BulkResult): string {
  const lines: string[] = ['', 'CAD MCP LLM Eval Results', '===========================', ''];
  lines.push('Per-model:');
  for (const [label, s] of Object.entries(bulk.perModel).sort()) {
    lines.push(`  ${label.padEnd(28)} ${s.pass}/${s.total}  (${((s.pass / s.total) * 100).toFixed(1)}%)`);
  }
  lines.push('', 'Per-question:');
  for (const [qid, s] of Object.entries(bulk.perQuestion).sort()) {
    lines.push(`  ${qid.padEnd(40)} ${s.pass}/${s.total}  (${((s.pass / s.total) * 100).toFixed(1)}%)`);
  }
  lines.push('', `Overall: ${bulk.overall.pass}/${bulk.overall.total}  (${(bulk.overall.pct * 100).toFixed(1)}%)`, '');
  return lines.join('\n');
}

function writeLog(
  logDir: string,
  model: EvalModel,
  question: EvalQuestion,
  data: {
    text: string;
    toolCalls: ToolCallEntry[];
    toolResults: ToolResultEntry[];
    finishReason: string;
    usage: UsageEntry | null;
    steps: StepSummaryEntry[];
    warnings: string[];
    extracted: unknown;
    correct: boolean;
  },
): void {
  fs.mkdirSync(logDir, { recursive: true });
  const slug = `${question.id}__${model.label.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const logEntry = {
    questionId: question.id,
    modelLabel: model.label,
    modelId: model.id,
    prompt: question.prompt,
    text: data.text,
    finishReason: data.finishReason,
    usage: data.usage,
    steps: data.steps,
    toolCalls: data.toolCalls,
    toolResults: data.toolResults,
    warnings: data.warnings,
    extracted: data.extracted,
    correct: data.correct,
    expected: question.expected.value,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(logDir, `${slug}.json`), JSON.stringify(logEntry, null, 2));
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n... [truncated, total ${s.length} chars]`;
}

/**
 * Merge OpenRouter's usage.cost from providerMetadata into the raw usage blob.
 * The OpenRouter provider puts cost info at result.providerMetadata?.openrouter?.usage.
 */
function mergeRawWithOpenRouterCost(
  raw: Record<string, unknown> | undefined,
  providerMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const orMeta = (providerMetadata as Record<string, unknown>)?.openrouter as
    Record<string, unknown> | undefined;
  const orUsage = orMeta?.usage as
    | { cost?: number; costDetails?: Record<string, unknown> }
    | undefined;

  if (!orUsage) return raw;

  const merged = { ...(raw ?? {}) };
  if (orUsage.cost !== undefined) merged.cost = orUsage.cost;
  if (orUsage.costDetails) merged.costDetails = orUsage.costDetails;
  return merged;
}

const SYSTEM_PROMPT = `You are an AI assistant with access to 4 tools for inspecting STEP CAD files:
- inspect_step: model-level summary (bbox, volume, watertight, topology)
- query_step: declarative query (filter, group, measure, aggregate over faces/edges/bodies/pmi/etc.)
- diff_step: compare two STEP files
- transact_step: imperative pipeline for multi-step workflows

CRITICAL schema rules for query_step:
- "entities" MUST be a single string like "faces" or "edges", NOT an array
- "surface_type" must be one of: "plane", "cylinder", "cone", "sphere", "torus", "bspline", "other"
- "filter", "group_by", "measure", "aggregate", "select" are all optional

Example query_step call for cylindrical faces:
{"file_path": "model.step", "entities": "faces", "filter": {"surface_type": "cylinder"}}

If a tool call returns an error, READ the error message and correct the next call.

Return concrete answers (numbers, yes/no). Be concise.`;