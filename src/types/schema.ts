export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Point3D;
  max: Point3D;
}

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface UnitSystem {
  length: string;
  area: string;
  volume: string;
}

export interface ProviderInfo {
  name: string;
  capabilities: string[];
  limitations: string[];
}

export interface Provenance {
  provider: string;
  sourceId?: string;
  method: 'measured' | 'derived' | 'heuristic' | 'ml' | 'semantic';
}

export interface Evidence {
  confidence: number;
  sourceIds: string[];
  provider: string;
  method: Provenance['method'];
  explanation: string[];
  limitations: string[];
}

export interface Warning {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  message: string;
  sourceIds: string[];
  evidence?: Evidence;
}

export interface Limitation {
  source: string;
  message: string;
}
