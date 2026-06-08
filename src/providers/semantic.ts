import type { Limitation, ProviderInfo, Provenance, UnitSystem } from './schema.js';

export type SemanticCapability =
  | 'step_header'
  | 'schema_detection'
  | 'product_names'
  | 'pmi_hints'
  | 'product_structure'
  | 'authoring_info'
  | 'tolerance_detection'
  | 'assembly_hints';

export interface SemanticOptions {
  includeEntityCounts?: boolean;
}

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

export interface SemanticExportOptions {
  format: 'owl' | 'rdf';
}

export interface SemanticExport {
  format: SemanticExportOptions['format'];
  content: string;
}

export interface SemanticProvider {
  name: string;
  capabilities: readonly SemanticCapability[];
  extract(filePath: string, options?: SemanticOptions): Promise<SemanticModel>;
  export?(options: SemanticExportOptions): Promise<SemanticExport>;
}
