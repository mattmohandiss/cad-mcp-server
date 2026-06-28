/**
 * Model registry for the LLM eval.
 *
 * All models route through OpenRouter via a single OpenAI-compatible API.
 * Model IDs are OpenRouter's own identifiers.
 *
 * One env var: OPENROUTER_API_KEY
 */

export interface EvalModel {
  /** OpenRouter model id (e.g. "anthropic/claude-sonnet-4-5") */
  id: string;
  /** Human-friendly label for output tables and logs */
  label: string;
}

export const EVAL_MODELS: EvalModel[] = [
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'gpt-4o-mini', label: 'GPT-4o-mini' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];