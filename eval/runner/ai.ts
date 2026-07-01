import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { GatewayGenerationInfo, GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText, gateway, isStepCount, NoOutputGeneratedError } from 'ai';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EvalGenerationResult = any;

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

    return buildSuccessResult(scenario.prompt, result as EvalGenerationResult, schema);
  } catch (error) {
    return buildFailureResult(scenario.prompt, error);
  } finally {
    await mcpClient?.close();
  }
}

async function buildSuccessResult(
  prompt: string,
  result: EvalGenerationResult,
  schema: z.ZodType,
): Promise<ModelRunResult> {
  const gatewayInfo = await getGatewayRunInfo(result.finalStep.providerMetadata);
  let output: Record<string, unknown>;

  try {
    // result.text is finalStep.text — may be empty if model hit maxSteps
    // during tool calling. Walk steps backwards to find any text output.
    let text = result.text.trim();
    if (!text) {
      for (let i = result.steps.length - 1; i >= 0; i--) {
        const stepText = result.steps[i]?.text?.trim();
        if (stepText) {
          text = stepText;
          break;
        }
      }
    }

    if (!text) {
      return {
        ok: false,
        error: 'no text output generated — model exhausted max steps without producing an answer',
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

    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    try {
      output = JSON.parse(clean);
    } catch {
      // Try to extract a JSON object from the text
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found in response');
      output = JSON.parse(match[0]);
    }
    // Validate against the schema
    schema.parse(output);
  } catch (error) {
    if (isNoOutputGeneratedError(error)) {
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
      ok: false,
      error: `output parse error: ${error instanceof Error ? error.message : String(error)}`,
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

function buildFailureResult(prompt: string, error: unknown): ModelRunFailure {
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
  return result.toolCalls.map((toolCall: { toolName: string; input: unknown }) => ({
    name: toolCall.toolName,
    args: JSON.stringify(toolCall.input),
  }));
}

function collectToolResults(result: EvalGenerationResult): ToolResultEntry[] {
  return result.toolResults.map(
    (toolResult: { toolName: string; input: unknown; output: unknown }) => ({
      name: toolResult.toolName,
      args: JSON.stringify(toolResult.input),
      output: truncate(JSON.stringify(toolResult.output), 4_000),
    }),
  );
}

function collectSteps(result: EvalGenerationResult): StepEntry[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.steps.map((step: any) => ({
    stepNumber: step.stepNumber,
    text: step.text,
    toolCalls: step.toolCalls.map((toolCall: { toolName: string; input: unknown }) => ({
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
