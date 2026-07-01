import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EVAL_WORK_DIR, resolvePython } from '../../eval/runner/config.js';
import { generateGroundTruth, loadScenarios } from '../../eval/runner/scenarios.js';
import { withStepModel } from '../model-store.js';
import { isWasmAvailable } from './wasm-guard.js';

function canGenerateEvalFixtures(): boolean {
  try {
    execFileSync(resolvePython(), ['-c', 'import cadquery'], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(isWasmAvailable() && canGenerateEvalFixtures())(
  'source-driven eval fixtures',
  () => {
    it('generates STEP files into eval/.work and appends file paths to the prompt', async () => {
      const scenario = loadScenarios().find((item) => item.id === 'basic_volume');
      expect(scenario).toBeDefined();

      const generated = generateGroundTruth(scenario!);
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;

      const stepPath = path.join(EVAL_WORK_DIR, 'basic_volume', 'box.step');
      expect(fs.existsSync(stepPath)).toBe(true);
      expect(generated.scenario.prompt).toContain(stepPath);
      expect(generated.scenario.prompt).toContain('Generated STEP files:');

      const volume = await withStepModel(stepPath, async (model) => {
        const brep = await model.getBRepModel();
        return brep.volume;
      });

      expect(volume).toBeCloseTo(generated.groundTruth.volume_mm3 as number, 2);
    });
  },
);
