import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText, gateway, isStepCount } from 'ai';
import { resolveServerPath } from './config.js';
import type { EvalSpan, EvalSpanChecks, EvalTrace, ScenarioMeta, StepType } from './types.js';
import { type z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EvalGenerationResult = any;

export interface ModelRunSuccess {
  ok: true;
  trace: EvalTrace;
}

export interface ModelRunFailure {
  ok: false;
  error: string;
  trace: EvalTrace | null;
  text: string;
  finishReason: string;
}

export type ModelRunResult = ModelRunSuccess | ModelRunFailure;

export async function runModelWithMcp(
  modelId: string,
  scenario: ScenarioMeta,
  schema: z.ZodType,
): Promise<ModelRunResult> {
  let mcpClient: MCPClient | undefined;
  const start = Date.now();

  try {
    mcpClient = await createMCPClient({
      clientName: 'cad-mcp-eval-runner',
      transport: new StdioClientTransport({
        command: 'node',
        args: [resolveServerPath()],
        stderr: 'ignore',
      }),
    });

    const tools = await mcpClient.tools();
    const result = await generateText({
      model: gateway(modelId),
      tools,
      prompt:
        scenario.prompt +
        '\n\nRespond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation.',
      stopWhen: isStepCount(scenario.max_steps),
      providerOptions: {
        gateway: {
          tags: ['cad-mcp-eval', `scenario:${scenario.id}`, `model:${modelId}`],
          user: 'cad-mcp-eval-runner',
        } satisfies GatewayProviderOptions,
      },
    });

    return buildSuccessTrace(scenario, modelId, result as EvalGenerationResult, schema, start);
  } catch (error) {
    return buildFailureTrace(scenario.id, modelId, error);
  } finally {
    await mcpClient?.close();
  }
}

async function buildSuccessTrace(
  scenario: ScenarioMeta,
  modelId: string,
  result: EvalGenerationResult,
  schema: z.ZodType,
  start: number,
): Promise<ModelRunResult> {
  // Build spans from steps
  const spans: EvalSpan[] = [];
  for (const step of result.steps) {
    const toolCalls = step.toolCalls ?? [];
    for (const tc of toolCalls) {
      const toolResult = step.toolResults?.find(
        (tr: { toolCallId: string }) => tr.toolCallId === tc.toolCallId,
      );
      const output = buildToolOutput(toolResult);

      spans.push({
        step: step.stepNumber,
        type: classifyStep(tc.toolName, tc.input, scenario),
        toolName: tc.toolName,
        toolArgs: tc.input as Record<string, unknown>,
        toolOutput: output,
        reasoning: step.reasoningText?.trim() || undefined,
        performance: {
          durationMs: step.performance?.stepTimeMs ?? 0,
          inputTokens: step.usage?.inputTokens ?? 0,
          outputTokens: step.usage?.outputTokens ?? 0,
        },
        checks: buildSpanChecks(tc.toolName, output),
      });
    }
  }

  // Extract answer from text
  let extracted: unknown = null;
  let answerSourceStep = -1;

  // Walk backwards through steps for text output
  const allTexts: { step: number; text: string }[] = [];
  for (const step of result.steps) {
    if (step.text?.trim()) {
      allTexts.push({ step: step.stepNumber, text: step.text.trim() });
    }
  }

  if (allTexts.length > 0) {
    const last = allTexts[allTexts.length - 1];
    answerSourceStep = last.step;

    const clean = last.text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    try {
      extracted = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          extracted = JSON.parse(match[0]);
        } catch {
          /* leave as null */
        }
      }
    }

    // Validate
    if (extracted && typeof extracted === 'object') {
      try {
        schema.parse(extracted);
      } catch {
        /* schema mismatch, keep extracted */
      }
    }
  }

  const fieldValue =
    extracted && typeof extracted === 'object' && extracted !== null
      ? ((extracted as Record<string, unknown>)[scenario.field] ?? null)
      : null;

  const trace: EvalTrace = {
    scenarioId: scenario.id,
    modelId,
    prompt: scenario.prompt,
    answer: {
      extracted: fieldValue,
      expected: null, // set by runner after ground truth loaded
      match: false,
      sourceStep: answerSourceStep,
    },
    spans,
    totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };

  return { ok: true, trace };
}

function buildFailureTrace(scenarioId: string, modelId: string, error: unknown): ModelRunFailure {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    trace: null,
    text: '',
    finishReason: '',
  };
}

// ── Span classification ──────────────────────────────────────────────

const SCENARIO_TOOL_MAP: Record<string, { expected: string[]; distraction: string[] }> = {
  basic_volume: { expected: ['inspect_step'], distraction: [] },
  verify_dimensions: { expected: ['inspect_step'], distraction: [] },
  face_delta: { expected: ['diff_step'], distraction: [] },
  cyl_face_count: { expected: ['query_faces'], distraction: ['query_edges', 'measure_step'] },
  face_types: { expected: ['query_faces'], distraction: ['query_edges', 'measure_step'] },
  hole_diameters: { expected: ['query_faces'], distraction: ['query_edges', 'measure_step'] },
  hole_directions: { expected: ['query_faces'], distraction: ['query_edges'] },
  smallest_fillet: { expected: ['query_edges'], distraction: ['query_faces', 'measure_step'] },
  smallest_hole: { expected: ['query_faces'], distraction: ['query_edges', 'measure_step'] },
  drill_directions: { expected: ['query_faces'], distraction: ['query_edges'] },
  blind_vs_through: { expected: ['query_faces', 'measure_step'], distraction: ['query_edges'] },
  thin_walls: { expected: ['query_faces', 'measure_step'], distraction: ['query_edges'] },
  clearance_hole_to_edge: { expected: ['query_faces', 'measure_step'], distraction: [] },
};

const IRRELEVANT_FACE_TYPES = new Set(['other', 'bspline', 'cone', 'torus']);
const IRRELEVANT_EDGE_TYPES = new Set(['ellipse', 'bspline', 'other']);

function classifyStep(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  scenario: ScenarioMeta,
): StepType {
  if (toolName === 'inspect_step') return 'context';
  if (toolName === 'diff_step') return 'context';

  const map = SCENARIO_TOOL_MAP[scenario.id];

  if (toolName === 'measure_step') {
    if (map?.expected.includes('measure_step')) return 'measurement';
    return 'distraction';
  }

  if (toolName === 'query_faces') {
    const surfaceType = args?.surface_type;
    if (map?.distraction.includes('query_faces')) return 'distraction';
    if (typeof surfaceType === 'string' && IRRELEVANT_FACE_TYPES.has(surfaceType)) {
      return 'distraction';
    }
    return 'discovery';
  }

  if (toolName === 'query_edges') {
    const curveType = args?.curve_type;
    if (map?.distraction.includes('query_edges')) return 'distraction';
    if (typeof curveType === 'string' && IRRELEVANT_EDGE_TYPES.has(curveType)) {
      return 'distraction';
    }
    return 'discovery';
  }

  return 'distraction';
}

// ── Span checks ──────────────────────────────────────────────────────

function buildSpanChecks(
  toolName: string,
  output: { raw: unknown; structured?: Record<string, unknown> },
): EvalSpanChecks {
  let argsValid = true;
  let toolCorrect = true;
  let productive = true;

  // Check if the tool output contains a validation error
  if (typeof output.raw === 'string') {
    const raw = output.raw as string;
    if (raw.includes('MCP error -32602') || raw.includes('Input validation error')) {
      argsValid = false;
    }
  }

  // Check if the tool returned data (not just an error)
  const rawStr = typeof output.raw === 'string' ? output.raw : JSON.stringify(output.raw);
  if (rawStr.includes('"isError":true') || rawStr.includes('"ok":false')) {
    productive = false;
  }

  // Check for zero results with active filters (suspicious)
  if (toolName === 'query_faces' || toolName === 'query_edges') {
    const data = output.structured as Record<string, unknown> | undefined;
    const stats = data?.statistics as Record<string, number> | undefined;
    if (stats && stats.matched_faces === 0 && stats.total_faces > 0) {
      productive = false;
    }
  }

  return { argsValid, toolCorrect, productive };
}

// ── Tool output ──────────────────────────────────────────────────────

function buildToolOutput(toolResult: { output?: unknown } | undefined): {
  raw: unknown;
  structured?: Record<string, unknown>;
} {
  if (!toolResult?.output) return { raw: null };

  const output = toolResult.output as Record<string, unknown>;
  const content = output?.content as Array<{ type: string; text?: string }> | undefined;

  return {
    raw: content?.[0]?.text ?? output,
    structured: output?.structuredContent as Record<string, unknown> | undefined,
  };
}
