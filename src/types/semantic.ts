import type { Limitation, ProviderInfo, Provenance, UnitSystem } from './schema.js';

export interface PmiSummary {
  hasPmi: boolean;
  hasGdt: boolean;
  hasDimensions: boolean;
  detectedKeywords: string[];
  semanticStatus: 'not_detected' | 'keyword_detected' | 'unknown';
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
  limitations: Limitation[];
  provenance: Provenance[];
}
