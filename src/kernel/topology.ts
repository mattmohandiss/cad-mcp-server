import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BRepEdgeStatistics } from '../types/brep.js';
import { bucketLength, emptyStats } from '../utils/numbers.js';

export function getEdgeStatistics(kernel: OcctKernel, shape: ShapeHandle): BRepEdgeStatistics {
  const edges = kernel.getSubShapes(shape, 'edge');
  const byCurveType: Record<string, number> = {};
  const byLengthRange: BRepEdgeStatistics['byLengthRange'] = {
    tiny: 0,
    small: 0,
    medium: 0,
    large: 0,
    xlarge: 0,
  };

  if (edges.length === 0) {
    const stats = emptyStats();
    return {
      count: stats.count,
      totalLength: stats.total,
      averageLength: stats.average,
      minLength: stats.min,
      maxLength: stats.max,
      byCurveType,
      byLengthRange,
    };
  }

  let totalLength = 0;
  let minLength = Number.POSITIVE_INFINITY;
  let maxLength = Number.NEGATIVE_INFINITY;

  for (const edge of edges) {
    const curveType = kernel.curveType(edge);
    const length = kernel.getLength(edge);

    byCurveType[curveType] = (byCurveType[curveType] ?? 0) + 1;
    byLengthRange[bucketLength(length)]++;
    totalLength += length;
    if (length < minLength) minLength = length;
    if (length > maxLength) maxLength = length;
  }

  return {
    count: edges.length,
    totalLength,
    averageLength: totalLength / edges.length,
    minLength,
    maxLength,
    byCurveType,
    byLengthRange,
  };
}
