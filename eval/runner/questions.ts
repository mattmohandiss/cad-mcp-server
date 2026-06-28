/**
 * The 5 eval questions, with ground-truth expected answers drawn from
 * the meta.json files in samples/eval-generated/.
 *
 * Each question defines:
 *   - id: stable identifier for logging
 *   - prompt: the natural-language question sent to the LLM
 *   - targetFile: which generated STEP file the question is about
 *   - scorer: how to extract the answer from the conversation
 *   - expected: the ground-truth answer (with tolerance where relevant)
 *
 * The scorer runs after the conversation completes. It walks the
 * captured tool calls and extracts a number/string/bool from the
 * structured response. This is more robust than parsing the LLM's
 * prose, because the tool response is deterministic.
 */

import type { ToolCall } from './openrouter.js';

export type AnswerKind = 'number' | 'boolean' | 'string';

export interface ExpectedAnswer {
  kind: AnswerKind;
  value: number | boolean | string;
  /** Numeric tolerance (for kind === 'number'). Default 0.01. */
  tolerance?: number;
}

export interface EvalQuestion {
  id: string;
  /** Natural-language question sent as the first user message. */
  prompt: string;
  /** Which generated STEP file to use. Resolved at run time. */
  targetFile: string;
  /** Ground-truth expected answer. */
  expected: ExpectedAnswer;
  /** Tool-call extraction function. Returns null if no usable answer. */
  extract: (toolCalls: ToolCall[], toolResults: string[]) => number | boolean | string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers: extract from query_step tool responses                    */
/* ------------------------------------------------------------------ */

/**
 * Walk the captured tool calls/results. For each query_step call,
 * parse the corresponding tool result (the JSON response) and return
 * it as a parsed object.
 */
function parseQueryStepResults(
  toolCalls: ToolCall[],
  toolResults: string[],
): Array<{ args: Record<string, unknown>; response: Record<string, unknown> }> {
  const out: Array<{ args: Record<string, unknown>; response: Record<string, unknown> }> = [];
  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i];
    if (call.function.name !== 'query_step' && call.function.name !== 'inspect_step') continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      continue;
    }
    let response: Record<string, unknown> = {};
    try {
      response = JSON.parse(toolResults[i] ?? '{}');
    } catch {
      continue;
    }
    out.push({ args, response });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  The 5 questions                                                    */
/* ------------------------------------------------------------------ */

export const QUESTIONS: EvalQuestion[] = [
  {
    id: 'cyl_face_count_box_with_3_holes',
    prompt:
      "Open the STEP file at samples/eval-generated/box_with_3_holes.step. How many cylindrical faces does it contain? " +
      "Use the query_step tool. Return just the number.",
    targetFile: 'box_with_3_holes.step',
    expected: { kind: 'number', value: 3, tolerance: 0 },
    extract: (calls, results) => {
      const parsed = parseQueryStepResults(calls, results);
      for (const { response } of parsed) {
        const entities = response.entities;
        if (Array.isArray(entities)) {
          const cylCount = entities.filter(
            (e) => (e as { surface_type?: string }).surface_type === 'cylinder',
          ).length;
          if (cylCount > 0) return cylCount;
        }
      }
      return null;
    },
  },
  {
    id: 'smallest_hole_diameter',
    prompt:
      "Open the STEP file at samples/eval-generated/box_with_3_holes.step. " +
      "What is the smallest hole diameter in millimeters? " +
      "Use the query_step tool. Return just the number with units like '5mm' or '5.0 mm'.",
    targetFile: 'box_with_3_holes.step',
    expected: { kind: 'number', value: 5.0, tolerance: 0.5 },
    extract: (calls, results) => {
      const parsed = parseQueryStepResults(calls, results);
      for (const { response } of parsed) {
        const entities = response.entities;
        if (Array.isArray(entities)) {
          const cylFaces = entities.filter(
            (e) => (e as { surface_type?: string }).surface_type === 'cylinder',
          );
          if (cylFaces.length > 0) {
            const radii = cylFaces
              .map((e) => (e as { radius?: number }).radius)
              .filter((r): r is number => typeof r === 'number');
            if (radii.length > 0) return Math.min(...radii) * 2; // diameter
          }
        }
      }
      return null;
    },
  },
  {
    id: 'smallest_fillet_radius',
    prompt:
      "Open the STEP file at samples/eval-generated/stepped_cylinder.step. " +
      "What is the smallest fillet radius in millimeters? " +
      "Use the query_step tool on the edges. Return just the number.",
    targetFile: 'stepped_cylinder.step',
    expected: { kind: 'number', value: 1.0, tolerance: 0.5 },
    extract: (calls, results) => {
      const parsed = parseQueryStepResults(calls, results);
      let smallest: number | null = null;
      for (const { response } of parsed) {
        const entities = response.entities;
        if (!Array.isArray(entities)) continue;
        for (const e of entities) {
          const edge = e as {
            curve_type?: string;
            radius?: number;
          };
          if (edge.curve_type === 'circle' && typeof edge.radius === 'number') {
            if (smallest === null || edge.radius < smallest) {
              smallest = edge.radius;
            }
          }
        }
      }
      return smallest;
    },
  },
  {
    id: 'diff_bracket_cylindrical_groups',
    prompt:
      "Compare the two STEP files: samples/eval-generated/bracket_v1.step and " +
      "samples/eval-generated/bracket_v2.step. Use the diff_step tool. " +
      "What is the difference in the number of cylindrical face groups between the two files? " +
      "Return just the number.",
    targetFile: 'bracket_v1.step',
    expected: { kind: 'number', value: 1, tolerance: 0 },
    extract: (calls, results) => {
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (call.function.name !== 'diff_step') continue;
        let response: Record<string, unknown> = {};
        try {
          response = JSON.parse(results[i] ?? '{}');
        } catch {
          continue;
        }
        /* The diff response includes counts per entity type. The exact
         * shape depends on the tool output; we look for any "cylindrical"
         * count delta in the result. */
        const text = JSON.stringify(response);
        /* Quick parse: look for fields like "cylindrical_faces_added"
         * or "cylindrical_face_groups_added" and pull the number. */
        const match = text.match(/"cylindrical[^"]*_added["']?\s*:\s*(-?\d+(?:\.\d+)?)/);
        if (match) return Number(match[1]);
        const match2 = text.match(/"cylindrical[^"]*":\s*(\{[^}]*\})/);
        if (match2) {
          const obj = JSON.parse(match2[1]) as Record<string, number>;
          const total = Object.values(obj).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
          if (total !== 0) return total;
        }
        return null;
      }
      return null;
    },
  },
  {
    id: 'box_volume',
    prompt:
      "Open the STEP file at samples/eval-generated/box.step. " +
      "What is the volume of the part in cubic millimeters? " +
      "Use the inspect_step tool. Return just the number.",
    targetFile: 'box.step',
    expected: { kind: 'number', value: 30000, tolerance: 100 },
    extract: (calls, results) => {
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (call.function.name !== 'inspect_step') continue;
        let response: Record<string, unknown> = {};
        try {
          response = JSON.parse(results[i] ?? '{}');
        } catch {
          continue;
        }
        const size = response.size as { volume?: number } | undefined;
        if (size && typeof size.volume === 'number') return size.volume;
      }
      return null;
    },
  },
];
