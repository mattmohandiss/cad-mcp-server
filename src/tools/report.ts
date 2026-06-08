import { generateStepReport, type ReportType } from '../cad/report.js';
import { wrapTool } from './shared.js';

export async function handleGenerateStepReport(filePath: string, reportType: ReportType) {
  return wrapTool(async () => generateStepReport(filePath, reportType));
}
