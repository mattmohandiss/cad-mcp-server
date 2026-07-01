import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { GatewayGenerationInfo, GatewayProviderOptions } from '@ai-sdk/gateway';
import {
  generateText,
  gateway,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type GenerateTextResult,
  type ToolSet,
} from 'ai';
import { resolveServerPath } from './config.js';
import type {
  GatewayRunInfo,
  ScenarioMeta,
  StepEntry,
  ToolCallEntry,
  ToolResultEntry,
  UsageEntry,
} from './types.js';
import { truncate } from './util.js';
import { type z } from 'zod';

type EvalGenerationResult = GenerateTextResult<ToolSet, never, ReturnType<typeof Output.object>>;

export interface ModelRunSuccess {
  ok: true;
  output: Record<string, unknown>;
  text: string;
  finishReason: string;
  reasoningText?: string;
  toolCalls: ToolCallEntry[];
  toolResults: ToolResultEntry[];
  usage: UsageEntry | null;
  steps: StepEntry[];
  transcript: string;
}

export interface ModelRunFailure {
  ok: false;
  error: string;
  output: Record<string, unknown> | null;
  text: string;
  finishReason: string;
  toolCalls: ToolCallEntry[];
  toolResults: ToolResultEntry[];
  usage: UsageEntry | null;
  steps: StepEntry[];
  transcript: string;
}

export type ModelRunResult = ModelRunSuccess | ModelRunFailure;

export async function runModelWithMcp(
  modelId: string,
  scenario: ScenarioMeta,
  schema: z.ZodType,
): Promise<ModelRunResult> {
  let mcpClient: MCPClient | undefined;

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
      prompt: scenario.prompt,
      stopWhen: isStepCount(scenario.max_steps),
      output: Output.object({
        name: 'CadEvalAnswer',
        description: `Structured answer for CAD MCP eval scenario ${scenario.id}.`,
        schema,
      }),
      providerOptions: {
        gateway: {
          tags: ['cad-mcp-eval', `scenario:${scenario.id}`, `model:${modelId}`],
          user: 'cad-mcp-eval-runner',
        } satisfies GatewayProviderOptions,
      },
    });

    return buildSuccessResult(scenario.prompt, result as EvalGenerationResult);
  } catch (error) {
    return buildFailureResult(scenario.prompt, error);
  } finally {
    await mcpClient?.close();
  }
}

async function buildSuccessResult(
  prompt: string,
  result: EvalGenerationResult,
): Promise<ModelRunResult> {
  const gatewayInfo = await getGatewayRunInfo(result.finalStep.providerMetadata);
  let output: Record<string, unknown>;

  try {
    output = asRecord(result.output);
  } catch (error) {
    if (!isNoOutputGeneratedError(error)) throw error;

    return {
      ok: false,
      error: 'no structured output generated',
      output: null,
      text: result.text,
      finishReason: result.finishReason,
      toolCalls: collectToolCalls(result),
      toolResults: collectToolResults(result),
      usage: buildUsage(result.usage, gatewayInfo),
      steps: collectSteps(result),
      transcript: buildTranscript(prompt, result, null),
    };
  }

  return {
    ok: true,
    output,
    text: JSON.stringify(output),
    finishReason: result.finishReason,
    reasoningText: result.finalStep.reasoningText,
    toolCalls: collectToolCalls(result),
    toolResults: collectToolResults(result),
    usage: buildUsage(result.usage, gatewayInfo),
    steps: collectSteps(result),
    transcript: buildTranscript(prompt, result, output),
  };
}

function isNoOutputGeneratedError(error: unknown): boolean {
  return (
    NoOutputGeneratedError.isInstance(error) ||
    (error instanceof Error && error.name === 'AI_NoOutputGeneratedError')
  );
}

async function buildFailureResult(prompt: string, error: unknown): Promise<ModelRunFailure> {
  if (NoObjectGeneratedError.isInstance(error)) {
    const output = null;
    return {
      ok: false,
      error: `structured output error: ${String(error.cause ?? error.message)}`,
      output,
      text: error.text ?? '',
      finishReason: '',
      toolCalls: [],
      toolResults: [],
      usage: error.usage ? buildUsage(error.usage, undefined) : null,
      steps: [],
      transcript: buildErrorTranscript(prompt, error.text ?? '', error.message),
    };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    output: null,
    text: '',
    finishReason: '',
    toolCalls: [],
    toolResults: [],
    usage: null,
    steps: [],
    transcript: buildErrorTranscript(
      prompt,
      '',
      error instanceof Error ? error.message : String(error),
    ),
  };
}

function collectToolCalls(result: EvalGenerationResult): ToolCallEntry[] {
  return result.toolCalls.map((toolCall) => ({
    name: toolCall.toolName,
    args: JSON.stringify(toolCall.input),
  }));
}

function collectToolResults(result: EvalGenerationResult): ToolResultEntry[] {
  return result.toolResults.map((toolResult) => ({
    name: toolResult.toolName,
    args: JSON.stringify(toolResult.input),
    output: truncate(JSON.stringify(toolResult.output), 4_000),
  }));
}

function collectSteps(result: EvalGenerationResult): StepEntry[] {
  return result.steps.map((step) => ({
    stepNumber: step.stepNumber,
    text: step.text,
    toolCalls: step.toolCalls.map((toolCall) => ({
      name: toolCall.toolName,
      args: JSON.stringify(toolCall.input),
    })),
    finishReason: step.finishReason,
    stepTimeMs: step.performance.stepTimeMs,
    usage: {
      inputTokens: step.usage.inputTokens,
      outputTokens: step.usage.outputTokens,
      totalTokens: step.usage.totalTokens,
    },
  }));
}

function buildUsage(
  usage: EvalGenerationResult['usage'],
  gatewayInfo: GatewayRunInfo | undefined,
): UsageEntry {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cost: gatewayInfo?.totalCost,
    generationId: gatewayInfo?.id,
    providerName: gatewayInfo?.providerName,
  };
}

async function getGatewayRunInfo(providerMetadata: unknown): Promise<GatewayRunInfo | undefined> {
  const generationId = getGatewayGenerationId(providerMetadata);
  if (!generationId) return undefined;

  try {
    const info: GatewayGenerationInfo = await gateway.getGenerationInfo({ id: generationId });
    return info;
  } catch {
    return { id: generationId } as GatewayRunInfo;
  }
}

function getGatewayGenerationId(providerMetadata: unknown): string | undefined {
  if (!providerMetadata || typeof providerMetadata !== 'object') return undefined;

  const metadata = providerMetadata as Record<string, unknown>;
  const gatewayMetadata = metadata.gateway;
  if (!gatewayMetadata || typeof gatewayMetadata !== 'object') return undefined;

  const generationId = (gatewayMetadata as Record<string, unknown>).generationId;
  return typeof generationId === 'string' ? generationId : undefined;
}

function asRecord(output: unknown): Record<string, unknown> {
  return output && typeof output === 'object' && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : {};
}

function buildTranscript(
  prompt: string,
  result: EvalGenerationResult,
  output: Record<string, unknown> | null,
): string {
  const lines = [`## User\n\n${prompt}`, ''];

  for (const step of result.steps) {
    if (step.reasoningText) lines.push('## Assistant Reasoning', '', step.reasoningText, '');
    if (step.text.trim()) lines.push('## Assistant', '', step.text, '');

    for (const toolCall of step.toolCalls) {
      lines.push(
        `### Tool Call: ${toolCall.toolName}`,
        '',
        '```json',
        JSON.stringify(toolCall.input, null, 2),
        '```',
        '',
      );
    }

    for (const toolResult of step.toolResults) {
      lines.push(
        `### Tool Result: ${toolResult.toolName}`,
        '',
        '```json',
        JSON.stringify(toolResult.output, null, 2),
        '```',
        '',
      );
    }
  }

  if (output) {
    lines.push('## Structured Output', '', '```json', JSON.stringify(output, null, 2), '```', '');
  } else if (result.text.trim()) {
    lines.push('## Final Text', '', result.text, '');
  }

  return lines.join('\n');
}

function buildErrorTranscript(prompt: string, text: string, error: string): string {
  return ['## User', '', prompt, '', '## Error', '', error, '', '## Raw Text', '', text].join('\n');
}
