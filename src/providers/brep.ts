import type {
  BoundingBox,
  Dimensions,
  ProviderInfo,
  Provenance,
  UnitSystem,
  Warning,
} from './schema.js';

export type BRepCapability =
  | 'step_import'
  | 'body_metrics'
  | 'edge_statistics'
  | 'surface_types'
  | 'curve_types';

export interface BRepLoadOptions {
  includeBodies?: boolean;
  includeEdges?: boolean;
}

export interface BRepBody {
  id: string;
  index: number;
  boundingBox: BoundingBox;
  dimensions: Dimensions;
  volume: number;
  surfaceArea: number;
}

export interface BRepEdgeStatistics {
  count: number;
  totalLength: number;
  averageLength: number;
  minLength: number;
  maxLength: number;
  byCurveType: Record<string, number>;
  byLengthRange: Record<'tiny' | 'small' | 'medium' | 'large' | 'xlarge', number>;
}

export interface BRepHealth {
  isValid?: boolean;
  warnings: Warning[];
}

export interface BRepModel {
  provider: ProviderInfo;
  filePath: string;
  units: UnitSystem;
  boundingBox: BoundingBox;
  dimensions: Dimensions;
  volume: number;
  surfaceArea: number;
  bodyCount: number;
  shapeType: 'box' | 'cylindrical' | 'complex';
  faceCount?: number;
  edgeStatistics?: BRepEdgeStatistics;
  bodies: BRepBody[];
  health: BRepHealth;
  provenance: Provenance[];
}

export interface BRepProvider {
  name: string;
  capabilities: readonly BRepCapability[];
  load(filePath: string, options?: BRepLoadOptions): Promise<BRepModel>;
}
