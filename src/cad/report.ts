import { analyzeStepFile } from './analyze.js';
import { exchangeSummary, geometrySummary, healthSummary, providerSummary } from './projections.js';
import type { Inference } from './schema.js';
import type { Limitation, Warning } from '../providers/schema.js';

export type ReportType =
  | 'engineering_review'
  | 'supplier_review'
  | 'import_risk'
  | 'space_claim'
  | 'manufacturing_handoff'
  | 'pmi_audit';

export interface ReportSections {
  geometry: ReturnType<typeof geometrySummary>;
  exchange: ReturnType<typeof exchangeSummary>;
  health: ReturnType<typeof healthSummary>;
  inferences: Inference[];
  warnings: Warning[];
  limitations: Limitation[];
  providers: ReturnType<typeof providerSummary>;
}

export async function generateStepReport(filePath: string, reportType: ReportType) {
  const graph = await analyzeStepFile(filePath);
  const sections: ReportSections = {
    geometry: geometrySummary(graph),
    exchange: exchangeSummary(graph),
    health: healthSummary(graph),
    inferences: graph.inferences,
    warnings: graph.warnings,
    limitations: graph.limitations,
    providers: providerSummary(graph),
  };

  return {
    filePath,
    reportType,
    sections,
    markdown: renderMarkdown(filePath, reportType, sections),
  };
}

function renderMarkdown(filePath: string, reportType: ReportType, sections: ReportSections) {
  return [
    `# STEP ${reportType.replace(/_/g, ' ')} Report`,
    '',
    `File: \`${filePath}\``,
    '',
    '## Geometry',
    `- Bodies: ${sections.geometry.bodyCount}`,
    `- Dimensions: ${sections.geometry.dimensions.width.toFixed(3)} x ${sections.geometry.dimensions.height.toFixed(3)} x ${sections.geometry.dimensions.depth.toFixed(3)} ${sections.geometry.units.length}`,
    `- Volume: ${sections.geometry.volume.toFixed(3)} ${sections.geometry.units.volume}`,
    `- Surface area: ${sections.geometry.surfaceArea.toFixed(3)} ${sections.geometry.units.area}`,
    '',
    '## Exchange',
    `- Schema: ${sections.exchange.schema ?? 'unknown'}`,
    `- PMI status: ${sections.exchange.pmi.semanticStatus}`,
    '',
    '## Warnings',
    ...(sections.warnings.length
      ? sections.warnings.map((warning) => `- ${warning.severity}: ${warning.message}`)
      : ['- No high-level warnings beyond provider limitations.']),
    '',
    '## Limitations',
    ...sections.limitations.map((limitation) => `- ${limitation.source}: ${limitation.message}`),
  ].join('\n');
}
