/**
 * Replay test: reads existing eval logs and re-runs extraction + scoring.
 *
 * Useful for iterating on extractors without paying for API calls.
 * After a live run, the runner writes per-(question, model) JSON logs
 * to tests/eval-logs/*.json.
 *
 * Skipped when no logs exist (e.g. in CI).
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QUESTIONS } from '../../eval/runner/questions.js';

const LOG_DIR = path.join(process.cwd(), 'tests', 'eval-logs');

interface LogEntry {
  questionId: string;
  modelLabel: string;
  prompt: string;
  text: string;
  toolCalls: Array<{ name: string; args: string }>;
}

function loadLogs(): LogEntry[] {
  if (!fs.existsSync(LOG_DIR)) return [];
  const out: LogEntry[] = [];
  for (const entry of fs.readdirSync(LOG_DIR)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const text = fs.readFileSync(path.join(LOG_DIR, entry), 'utf8');
      out.push(JSON.parse(text) as LogEntry);
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function hasLogs(): boolean {
  return fs.existsSync(LOG_DIR) && fs.readdirSync(LOG_DIR).some((f) => f.endsWith('.json'));
}

describe.skipIf(!hasLogs())('replay: extractors + scoring against saved eval logs', () => {
  it('re-extracts and scores all logged conversations', () => {
    const logs = loadLogs();
    expect(logs.length).toBeGreaterThan(0);

    let pass = 0;
    const perModel: Record<string, { pass: number; total: number }> = {};
    const perQuestion: Record<string, { pass: number; total: number }> = {};

    for (const log of logs) {
      const q = QUESTIONS.find((q) => q.id === log.questionId);
      if (!q) {
        process.stdout.write(`  Unknown question id: ${log.questionId}\n`);
        continue;
      }

      const extracted = q.extract(log.text, log.toolCalls);
      const correct = doCompare(extracted, q);

      if (correct) pass++;
      perModel[log.modelLabel] ??= { pass: 0, total: 0 };
      perModel[log.modelLabel].total++;
      if (correct) perModel[log.modelLabel].pass++;
      perQuestion[log.questionId] ??= { pass: 0, total: 0 };
      perQuestion[log.questionId].total++;
      if (correct) perQuestion[log.questionId].pass++;
    }

    process.stdout.write('\n=== Replay results (no API calls) ===\n');
    process.stdout.write('Per-model:\n');
    for (const [label, s] of Object.entries(perModel).sort()) {
      const pct = s.total === 0 ? 0 : (s.pass / s.total) * 100;
      process.stdout.write(`  ${label.padEnd(28)} ${s.pass}/${s.total}  (${pct.toFixed(1)}%)\n`);
    }
    process.stdout.write('Per-question:\n');
    for (const [qid, s] of Object.entries(perQuestion).sort()) {
      const pct = s.total === 0 ? 0 : (s.pass / s.total) * 100;
      process.stdout.write(`  ${qid.padEnd(40)} ${s.pass}/${s.total}  (${pct.toFixed(1)}%)\n`);
    }
    process.stdout.write(`Overall: ${pass}/${logs.length}  (${((pass / logs.length) * 100).toFixed(1)}%)\n`);

    expect(logs.length).toBeGreaterThan(0);
  });
});

function doCompare(extracted: number | boolean | string | null, question: typeof QUESTIONS[number]): boolean {
  if (extracted === null) return false;
  if (typeof extracted !== typeof question.expected.value) return false;
  if (question.expected.kind === 'number') {
    const tol = question.expected.tolerance ?? 0.01;
    const diff = Math.abs((extracted as number) - (question.expected.value as number));
    if (diff < tol) return true;
    const denom = Math.max(Math.abs(extracted as number), Math.abs(question.expected.value as number), 1e-9);
    return diff / denom < 0.01;
  }
  return extracted === question.expected.value;
}