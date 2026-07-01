import type { GatewayGenerationInfo } from '@ai-sdk/gateway';

// ── Span & trace types ──────────────────────────────────────────────

export type StepType = 'context' | 'discovery' | 'measurement' | 'distraction' | 'answer';

export interface EvalSpanPerformance {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface EvalSpanChecks {
  argsValid: boolean;
  toolCorrect: boolean;
  productive: boolean;
}

export interface EvalSpan {
  step: number;
  type: StepType;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolOutput: { raw: unknown; structured?: Record<string, unknown> };
  reasoning?: string;
  performance: EvalSpanPerformance;
  checks: EvalSpanChecks;
}

export interface EvalTrace {
  scenarioId: string;
  modelId: string;
  prompt: string;
  answer: { extracted: unknown; expected: unknown; match: boolean; sourceStep: number };
  spans: EvalSpan[];
  totalTokens: number;
  durationMs: number;
  timestamp: string;
}

// ── Legacy result types (keep for output compatibility) ──────────────

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

// ── Scenario metadata ────────────────────────────────────────────────

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

export interface ScenarioReference {
  scenarioId: string;
  expectedTools: string[];
  optionalTools: string[];
  disallowedTools: string[];
  minDiscoverySteps: number;
  minMeasureSteps: number;
  expectedAnswer: unknown;
}

// ── Scenario result (backward-compatible with existing reporting) ────

export interface ScenarioResult {
  scenarioId: string;
  modelId: string;
  trace: EvalTrace;
  // Flattened summary fields for quick reporting
  field: string;
  expected: unknown;
  extracted: unknown;
  correct: boolean;
  checks: {
    toolCorrect: number;
    pathEfficient: number;
    fieldExtraction: number;
    argsValid: number;
  };
  compositeScore: number;
  reason: string;
  finishReason: string;
  usage: UsageEntry | null;
  durationMs: number;
}

// ── Bulk run ─────────────────────────────────────────────────────────

export interface BulkResult {
  results: ScenarioResult[];
  perModel: Record<string, { pass: number; total: number; avgComposite: number }>;
  perScenario: Record<string, { pass: number; total: number }>;
  overall: { pass: number; total: number; pct: number; avgComposite: number };
  _meta: {
    modelMeta: Record<string, { tokens: number; cost: number }>;
    totalTokens: number;
    totalCost: number;
    durationMs: number;
  };
}

// ── Gateway ──────────────────────────────────────────────────────────

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
