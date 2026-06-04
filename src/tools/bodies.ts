import { listBodies } from '../utils/cad-analyzer.js';
import { isError, type Body } from '../utils/schema.js';

export async function handleListBodies(filePath: string): Promise<unknown> {
  const result = await listBodies(filePath);

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
      bodyCount: result.length,
      bodies: result.map((body) => ({
        index: body.index,
        volume: body.volume.toFixed(2),
        surfaceArea: body.surfaceArea.toFixed(2),
        boundingBox: body.boundingBox,
        features: body.features,
        summary: generateBodySummary(body),
      })),
    },
  };
}

function generateBodySummary(body: Body): string {
  const features: string[] = [];
  if (body.features.hasHoles) features.push('holes');
  if (body.features.hasFillets) features.push('fillets');

  const featureStr = features.length > 0 ? ` with ${features.join(', ')}` : '';
  return `Body ${body.index}: ${body.volume.toFixed(0)} mm³${featureStr}`;
}
