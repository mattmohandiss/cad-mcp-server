/**
 * Score an extracted answer against the expected ground truth.
 *
 * The scorer returns a structured result with three booleans:
 *   - toolSelected: did the LLM pick the right tool for the question?
 *   - schemaValid: were the LLM's tool inputs schema-valid? (we trust
 *     OpenRouter's tool-calling here; schema violations would surface
 *     as a 400 from the API)
 *   - contentCorrect: did the extracted answer match the ground truth?
 *
 * For numbers, we apply a tolerance (default 0.01) and also accept
 * the answer if it matches within 1% relative error.
 */

import type { EvalQuestion, ExpectedAnswer } from './questions.js';

export interface ScoreResult {
  questionId: string;
  toolSelected: boolean;
  schemaValid: boolean;
  contentCorrect: boolean;
  extracted: number | boolean | string | null;
  expected: number | boolean | string;
  reason: string;
}

const RELATIVE_TOLERANCE = 0.01; // 1%

export function scoreAnswer(
  question: EvalQuestion,
  extracted: number | boolean | string | null,
  toolSelected: boolean,
  schemaValid: boolean,
): ScoreResult {
  if (extracted === null) {
    return {
      questionId: question.id,
      toolSelected,
      schemaValid,
      contentCorrect: false,
      extracted: null,
      expected: question.expected.value,
      reason: 'no extractable answer from tool calls',
    };
  }
  if (typeof extracted !== typeof question.expected.value) {
    return {
      questionId: question.id,
      toolSelected,
      schemaValid,
      contentCorrect: false,
      extracted,
      expected: question.expected.value,
      reason: `type mismatch: got ${typeof extracted}, expected ${typeof question.expected.value}`,
    };
  }
  const correct = compare(extracted, question.expected);
  return {
    questionId: question.id,
    toolSelected,
    schemaValid,
    contentCorrect: correct,
    extracted,
    expected: question.expected.value,
    reason: correct ? 'match' : 'value mismatch',
  };
}

function compare(
  actual: number | boolean | string,
  expected: ExpectedAnswer,
): boolean {
  if (expected.kind === 'boolean') {
    return actual === expected.value;
  }
  if (expected.kind === 'string') {
    return actual === expected.value;
  }
  /* number */
  if (typeof actual !== 'number') return false;
  const tol = expected.tolerance ?? 0.01;
  const absDiff = Math.abs(actual - (expected.value as number));
  if (absDiff < tol) return true;
  const denom = Math.max(Math.abs(actual), Math.abs(expected.value as number), 1e-9);
  return absDiff / denom < RELATIVE_TOLERANCE;
}
