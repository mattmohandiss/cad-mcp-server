/**
 * Model registry for the LLM eval.
 *
 * 3 models across 3 providers, all routed through OpenRouter.
 * Selection criteria:
 *   - Claude Sonnet: the design target (Anthropic)
 *   - GPT-4o-mini: the most-deployed frontier-class model (OpenAI)
 *   - Gemini 2.0 Flash: different model family (Google)
 *
 * Llama / opencode-go / others are intentionally excluded from the
 * first pass; we can add them once the eval pipeline is proven.
 */

export interface EvalModel {
  /** OpenRouter model id (e.g. "anthropic/claude-sonnet-4.5") */
  openrouterId: string;
  /** Human-friendly label for output tables and logs */
  label: string;
  /** Provider family for grouping in reports */
  family: 'anthropic' | 'openai' | 'google' | 'meta' | 'other';
}

export const EVAL_MODELS: EvalModel[] = [
  {
    openrouterId: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    family: 'anthropic',
  },
  {
    openrouterId: 'openai/gpt-4o-mini',
    label: 'GPT-4o-mini',
    family: 'openai',
  },
  {
    openrouterId: 'google/gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    family: 'google',
  },
];
