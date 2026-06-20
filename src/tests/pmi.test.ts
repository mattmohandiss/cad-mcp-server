import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleQueryStepPmi } from '../tools/step-tools.js';

interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
}

async function writeStepText(text: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cad-mcp-pmi-'));
  const filePath = path.join(dir, 'pmi.step');
  await writeFile(filePath, text, 'utf8');
  return filePath;
}

function expectSuccess(value: unknown): ToolSuccess {
  const response = value as ToolSuccess;
  expect(response.ok).toBe(true);
  return response;
}

describe('PMI query behavior', () => {
  it('filters and groups lightweight PMI entities from STEP text', async () => {
    const filePath = await writeStepText(`
ISO-10303-21;
DATA;
#10=POSITION_TOLERANCE('pos',0.05,#20,.MMC.);
#11=FLATNESS_TOLERANCE('flat',0.01,#21);
#12=DIAMETER_SIZE('diameter',12.5,#22);
#13=DATUM('A',#23);
#14=ANNOTATION_OCCURRENCE('CHECK SURFACE',#24);
ENDSEC;
END-ISO-10303-21;
`);

    const filtered = expectSuccess(
      await handleQueryStepPmi(filePath, {
        pmi_types: ['geometric_tolerance'],
        tolerance_subtypes: ['position'],
        value_max: 0.1,
      })
    );
    expect(filtered.data.schema_version).toBe('0.4');
    const entities = filtered.data.entities as Array<Record<string, unknown>>;
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe('geometric_tolerance');
    expect(entities[0].tolerance_type).toBe('position');

    const grouped = expectSuccess(
      await handleQueryStepPmi(filePath, {
        return_type: 'groups',
        group_by: ['type'],
      })
    );
    const groups = grouped.data.groups as Array<Record<string, unknown>>;
    expect(groups.map((group) => (group.key as Record<string, unknown>).type).sort()).toEqual([
      'annotation',
      'datum',
      'dimension',
      'geometric_tolerance',
    ]);
  });

  it('returns a no-PMI warning for STEP text without PMI entities', async () => {
    const filePath = await writeStepText("ISO-10303-21;\nDATA;\n#1=PRODUCT('x');\nENDSEC;");
    const result = expectSuccess(await handleQueryStepPmi(filePath, { return_type: 'summary' }));

    expect((result.data.statistics as Record<string, unknown>).total_pmi).toBe(0);
    expect((result.data.warnings as string[])[0]).toContain('No PMI entities found');
  });
});
