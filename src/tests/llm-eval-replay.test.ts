/**
 * Replay test: reads existing eval logs and reports stored results.
 *
 * Each log file contains the original scoring result. Replay reads
 * these cached values without any API calls — useful for CI validation.
 * Skipped when no logs exist.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'tests', 'eval-logs');

interface LogEntry {
  scenarioId: string;
  modelId: string;
  correct: boolean;
  score: number;
  reason: string;
}

function loadLogs(): LogEntry[] {
  if (!fs.existsSync(LOG_DIR)) return [];
  const out: LogEntry[] = [];
  for (const entry of fs.readdirSync(LOG_DIR)) {
    if (!entry.endsWith('.json') || entry === 'summary.json') continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(LOG_DIR, entry), 'utf8')));
    } catch {
      /* skip */
    }
  }
  return out;
}

function hasLogs(): boolean {
  return (
    fs.existsSync(LOG_DIR) &&
    fs.readdirSync(LOG_DIR).some((f) => f.endsWith('.json') && f !== 'summary.json')
  );
}

describe.skipIf(!hasLogs())('replay: cached results from saved eval logs', () => {
  it('reports stored scores from all logged runs', () => {
    const logs = loadLogs();
    expect(logs.length).toBeGreaterThan(0);

    let pass = 0;
    const perModel: Record<string, { pass: number; total: number }> = {};
    const perScenario: Record<string, { pass: number; total: number }> = {};

    for (const log of logs) {
      if (log.correct) pass++;
      perModel[log.modelId] ??= { pass: 0, total: 0 };
      perModel[log.modelId].total++;
      if (log.correct) perModel[log.modelId].pass++;
      perScenario[log.scenarioId] ??= { pass: 0, total: 0 };
      perScenario[log.scenarioId].total++;
      if (log.correct) perScenario[log.scenarioId].pass++;
    }

    process.stdout.write('\n=== Replay results (no API calls) ===\n');
    process.stdout.write('Per-model:\n');
    for (const [label, s] of Object.entries(perModel).sort()) {
      process.stdout.write(
        `  ${label.padEnd(48)} ${s.pass}/${s.total}  (${((s.pass / s.total) * 100).toFixed(1)}%)\n`,
      );
    }
    process.stdout.write('Per-scenario:\n');
    for (const [sid, s] of Object.entries(perScenario).sort()) {
      process.stdout.write(
        `  ${sid.padEnd(40)} ${s.pass}/${s.total}  (${((s.pass / s.total) * 100).toFixed(1)}%)\n`,
      );
    }
    process.stdout.write(
      `Overall: ${pass}/${logs.length}  (${((pass / logs.length) * 100).toFixed(1)}%)\n`,
    );
  });
});
