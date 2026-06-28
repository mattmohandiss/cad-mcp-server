/**
 * The 5 eval questions, with ground-truth expected answers drawn from
 * the meta.json files in samples/eval-generated/.
 *
 * Each question defines:
 *   - id: stable identifier for logging
 *   - prompt: the natural-language question sent to the LLM
 *   - targetFile: which generated STEP file the question is about
 *   - expected: the ground-truth answer (with tolerance for numbers)
 *   - extract: parse the LLM's final text response for the answer
 *
 * The extract function receives the LLM's final `text` (the last
 * assistant message) and a list of tool calls it made along the way.
 * It returns a number, boolean, or string — or null if no answer
 * could be extracted.
 */

export type AnswerKind = 'number' | 'boolean' | 'string';

export interface ExpectedAnswer {
  kind: AnswerKind;
  value: number | boolean | string;
  /** Numeric tolerance (for kind === 'number'). Default 0.01. */
  tolerance?: number;
}

export interface EvalQuestion {
  id: string;
  prompt: string;
  targetFile: string;
  expected: ExpectedAnswer;
  /** Extract the answer from the LLM's final text response.
   * The second arg is the list of tool calls made during the conversation. */
  extract: (
    text: string,
    toolCalls: Array<{ name: string; args: string }>,
  ) => number | boolean | string | null;
}

function parseNumber(text: string): number | null {
  if (!text) return null;
  // Strip markdown, units, commas
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\bmm\^?[23]?\b/gi, '')
    .replace(/,/g, '');
  // Look for "answer is N", "= N", "is N" patterns, preferring the last one
  const matches = [
    ...cleaned.matchAll(
      /(?:answer|result|smallest|largest|=|is|diameter|radius|volume|count|difference)\s*:?\s*(-?\d+(?:\.\d+)?)/gi,
    ),
  ];
  if (matches.length > 0) {
    const v = Number(matches[matches.length - 1][1]);
    if (Number.isFinite(v)) return v;
  }
  // Fallback: any number in the text (last one)
  const any = [...cleaned.matchAll(/-?\d+(?:\.\d+)?/g)];
  if (any.length > 0) {
    const v = Number(any[any.length - 1][0]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export const QUESTIONS: EvalQuestion[] = [
  {
    id: 'cyl_face_count',
    prompt:
      'Open the STEP file at samples/eval-generated/box_with_3_holes.step using query_step. ' +
      'How many cylindrical faces does it contain? Return just the number.',
    targetFile: 'box_with_3_holes.step',
    expected: { kind: 'number', value: 3, tolerance: 0 },
    extract: parseNumber,
  },
  {
    id: 'smallest_hole_diameter',
    prompt:
      'Open the STEP file at samples/eval-generated/box_with_3_holes.step. ' +
      'What is the smallest hole diameter in millimeters? Return just the number.',
    targetFile: 'box_with_3_holes.step',
    expected: { kind: 'number', value: 5.0, tolerance: 0.5 },
    extract: parseNumber,
  },
  {
    id: 'smallest_fillet_radius',
    prompt:
      'Open the STEP file at samples/eval-generated/stepped_cylinder.step. ' +
      'What is the smallest fillet radius in millimeters? Return just the number.',
    targetFile: 'stepped_cylinder.step',
    expected: { kind: 'number', value: 1.0, tolerance: 0.5 },
    extract: parseNumber,
  },
  {
    id: 'diff_face_count_delta',
    prompt:
      'Compare the two STEP files: samples/eval-generated/bracket_v1.step and ' +
      'samples/eval-generated/bracket_v2.step. Use the diff_step tool. ' +
      'What is the face count delta (comparison minus baseline)? Return just the number.',
    targetFile: 'bracket_v1.step',
    expected: { kind: 'number', value: 1, tolerance: 0 },
    extract: parseNumber,
  },
  {
    id: 'box_volume',
    prompt:
      'Open the STEP file at samples/eval-generated/box.step. ' +
      'What is the volume of the part in cubic millimeters? Return just the number.',
    targetFile: 'box.step',
    expected: { kind: 'number', value: 30000, tolerance: 100 },
    extract: parseNumber,
  },
];
