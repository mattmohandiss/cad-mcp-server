import type { GatewayGenerationInfo } from '@ai-sdk/gateway';

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
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  generationId?: string;
  providerName?: string;
}

export interface StepEntry {
  stepNumber: number;
  text: string;
  toolCalls: ToolCallEntry[];
  finishReason: string;
  stepTimeMs: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ScenarioMeta {
  id: string;
  field: string;
  tolerance: number;
  max_steps: number;
  prompt: string;
  dir: string;
  workDir?: string;
  files: Record<string, string>;
}

export interface ScenarioResult {
  scenarioId: string;
  modelId: string;
  field: string;
  expected: unknown;
  extracted: unknown;
  score: number;
  correct: boolean;
  reason: string;
  text: string;
  finishReason: string;
  toolCalls: ToolCallEntry[];
  toolResults: ToolResultEntry[];
  usage: UsageEntry | null;
  steps: StepEntry[];
  durationMs: number;
}

export interface BulkResult {
  results: ScenarioResult[];
  perModel: Record<string, { pass: number; total: number }>;
  perScenario: Record<string, { pass: number; total: number }>;
  overall: { pass: number; total: number; pct: number };
  _meta: {
    modelMeta: Record<string, { scoreSum: number; tokens: number; cost: number }>;
    totalTokens: number;
    totalCost: number;
    durationMs: number;
  };
}

export type GatewayRunInfo = Pick<
  GatewayGenerationInfo,
  | 'id'
  | 'totalCost'
  | 'providerName'
  | 'model'
  | 'finishReason'
  | 'promptTokens'
  | 'completionTokens'
>;
