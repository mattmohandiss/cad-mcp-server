import { extractEdges } from '../utils/cad-analyzer.js';
import { isError, type EdgeAnalysis } from '../utils/schema.js';

export async function handleExtractEdges(filePath: string): Promise<unknown> {
  const result = await extractEdges(filePath);

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
      totalEdgeCount: result.totalEdgeCount,
      statistics: {
        averageLength: result.statistics.averageLength.toFixed(2),
        minLength: result.statistics.minLength.toFixed(2),
        maxLength: result.statistics.maxLength.toFixed(2),
      },
      detectedFeatures: result.detectedFeatures,
      edgeLengthRanges: categorizeEdges(result.edges),
      summary: generateEdgeSummary(result),
    },
  };
}

function categorizeEdges(edges: EdgeAnalysis['edges']): Record<string, number> {
  const ranges: Record<string, number> = {
    tiny: 0, // < 1mm
    small: 0, // 1-5mm
    medium: 0, // 5-20mm
    large: 0, // 20-100mm
    xlarge: 0, // > 100mm
  };

  edges.forEach((edge) => {
    if (edge.length < 1) ranges.tiny++;
    else if (edge.length < 5) ranges.small++;
    else if (edge.length < 20) ranges.medium++;
    else if (edge.length < 100) ranges.large++;
    else ranges.xlarge++;
  });

  return ranges;
}

function generateEdgeSummary(analysis: EdgeAnalysis): string {
  const { detectedFeatures } = analysis;
  const features: string[] = [];
  if (detectedFeatures.hasHoles) features.push('holes');
  if (detectedFeatures.hasFillets) features.push('fillets');

  const featureStr = features.length > 0 ? ` Detected: ${features.join(', ')}.` : '';
  return `${analysis.totalEdgeCount} edges detected. Average length: ${analysis.statistics.averageLength.toFixed(1)}mm.${featureStr}`;
}
