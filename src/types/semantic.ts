import type { ProviderInfo, Provenance, UnitSystem } from './geometry.js';

export interface PmiSummary {
  hasPmi: boolean;
  hasGdtKeywords: boolean;
  hasDimensionKeywords: boolean;
  detectedKeywords: string[];
}

export interface SemanticFact {
  id: string;
  type: string;
  value: string | number | boolean;
  source: string;
}

export interface SemanticModel {
  provider: ProviderInfo;
  filePath: string;
  schema?: string;
  applicationProtocol?: string;
  units?: UnitSystem;
  productNames: string[];
  productCount: number;
  authoringSystem?: string;
  organizationName?: string;
  hasAssembly: boolean;
  toleranceEntityCount: number;
  shapeRepresentationCount: number;
  pmi: PmiSummary;
  entityCounts: Record<string, number>;
  facts: SemanticFact[];
  provenance: Provenance[];
}
