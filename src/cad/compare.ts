import { analyzeStepFile } from './analyze.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from './schema-version.js';

export async function compareStepFiles(fileA: string, fileB: string) {
  const [a, b] = await Promise.all([analyzeStepFile(fileA), analyzeStepFile(fileB)]);

  return {
    schema_version: CAD_RESPONSE_SCHEMA_VERSION,
    files: { a: fileA, b: fileB },
    deltas: {
      dimensions: {
        width: b.brep.dimensions.width - a.brep.dimensions.width,
        height: b.brep.dimensions.height - a.brep.dimensions.height,
        depth: b.brep.dimensions.depth - a.brep.dimensions.depth,
      },
      volume: b.brep.volume - a.brep.volume,
      surfaceArea: b.brep.surfaceArea - a.brep.surfaceArea,
      bodyCount: b.brep.bodyCount - a.brep.bodyCount,
      faceCount:
        b.brep.faceCount !== undefined && a.brep.faceCount !== undefined
          ? b.brep.faceCount - a.brep.faceCount
          : undefined,
      edgeCount:
        b.brep.edgeStatistics && a.brep.edgeStatistics
          ? b.brep.edgeStatistics.count - a.brep.edgeStatistics.count
          : undefined,
    },
    exchange: {
      schemaChanged: a.semantic.schema !== b.semantic.schema,
      productNamesA: a.semantic.productNames,
      productNamesB: b.semantic.productNames,
    },
    warnings: [...a.warnings, ...b.warnings],
    limitations: [
      ...a.limitations,
      ...b.limitations,
      {
        source: 'compare_step_files',
        message:
          'Comparison uses metric and metadata deltas only; stable feature identity across revisions is not inferred.',
      },
    ],
    providers: { a: a.providers, b: b.providers },
  };
}
