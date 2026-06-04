import { analyzeStepFile } from '../utils/cad-analyzer.js';
import { isError, type GeometrySummary } from '../utils/schema.js';

export async function handleAnalyzeStepFile(filePath: string): Promise<unknown> {
  const result = await analyzeStepFile(filePath);

  if (isError(result)) {
    return {
      success: false,
      error: result.message,
      type: result.type,
    };
  }

  return {
    success: true,
    data: {
      filePath,
      units: result.units,
      boundingBox: result.boundingBox,
      dimensions: result.dimensions,
      volume: result.volume,
      surfaceArea: result.surfaceArea,
      bodyCount: result.bodyCount,
      shapeType: result.shapeType,
      summary: generateSummary(result),
    },
  };
}

function generateSummary(geometry: GeometrySummary): string {
  const { dimensions, bodyCount, shapeType } = geometry;
  return (
    `Part is ${shapeType} shaped with dimensions ` +
    `${dimensions.width.toFixed(1)} × ${dimensions.height.toFixed(1)} × ${dimensions.depth.toFixed(1)} mm. ` +
    `${bodyCount} body/bodies detected. Volume: ${geometry.volume.toFixed(0)} mm³, ` +
    `Surface area: ${geometry.surfaceArea.toFixed(0)} mm².`
  );
}
