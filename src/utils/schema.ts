/**
 * Shared types and schemas for CAD analysis
 */

export interface GeometrySummary {
  units: string;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  volume: number;
  surfaceArea: number;
  bodyCount: number;
  shapeType: 'box' | 'cylindrical' | 'complex';
}

export interface Body {
  index: number;
  volume: number;
  surfaceArea: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  features: {
    hasHoles: boolean;
    hasFillets: boolean;
  };
}

export interface Edge {
  index: number;
  length: number;
  type: 'straight' | 'curve' | 'unknown';
}

export interface EdgeAnalysis {
  totalEdgeCount: number;
  edges: Edge[];
  statistics: {
    averageLength: number;
    minLength: number;
    maxLength: number;
  };
  detectedFeatures: {
    hasHoles: boolean;
    hasFillets: boolean;
  };
}

export interface AnalysisError {
  type: 'file_not_found' | 'invalid_format' | 'parse_error' | 'unknown';
  message: string;
}

export type AnalysisResult<T> = T | AnalysisError;

export function isError<T>(result: AnalysisResult<T>): result is AnalysisError {
  return typeof result === 'object' && result !== null && 'type' in result && 'message' in result;
}
