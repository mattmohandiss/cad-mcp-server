import { withStepModel } from './model-store.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from './schema-version.js';

export async function compareStepFiles(fileA: string, fileB: string) {
  return withStepModel(fileA, async (modelA) =>
    withStepModel(fileB, async (modelB) => {
      const [brepA, brepB, semanticA, semanticB] = await Promise.all([
        modelA.getBRepModel(),
        modelB.getBRepModel(),
        modelA.getSemanticModel(),
        modelB.getSemanticModel(),
      ]);

      return {
        schema_version: CAD_RESPONSE_SCHEMA_VERSION,
        files: { a: fileA, b: fileB },
        deltas: {
          dimensions: {
            width: brepB.dimensions.width - brepA.dimensions.width,
            height: brepB.dimensions.height - brepA.dimensions.height,
            depth: brepB.dimensions.depth - brepA.dimensions.depth,
          },
          volume: brepB.volume - brepA.volume,
          surfaceArea: brepB.surfaceArea - brepA.surfaceArea,
          bodyCount: brepB.bodyCount - brepA.bodyCount,
          faceCount:
            brepB.faceCount !== undefined && brepA.faceCount !== undefined
              ? brepB.faceCount - brepA.faceCount
              : undefined,
          edgeCount:
            brepB.edgeStatistics && brepA.edgeStatistics
              ? brepB.edgeStatistics.count - brepA.edgeStatistics.count
              : undefined,
        },
        exchange: {
          schemaChanged: semanticA.schema !== semanticB.schema,
          productNamesA: semanticA.productNames,
          productNamesB: semanticB.productNames,
        },
        warnings: [...brepA.health.warnings, ...brepB.health.warnings],
        limitations: [
          ...semanticA.limitations,
          ...semanticB.limitations,
          {
            source: 'compare_step_files',
            message:
              'Comparison uses metric and metadata deltas only; stable feature identity and adjacency across revisions are not inferred.',
          },
        ],
        providers: {
          a: [brepA.provider, semanticA.provider],
          b: [brepB.provider, semanticB.provider],
        },
      };
    })
  );
}
