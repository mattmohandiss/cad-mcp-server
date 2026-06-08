import type { AagModel } from '../providers/aag.js';
import type { BRepModel } from '../providers/brep.js';
import type { SemanticModel } from '../providers/semantic.js';
import type { Evidence, Limitation, ProviderInfo, Warning } from '../providers/schema.js';

export type KnowledgeCategory =
  | 'geometry'
  | 'topology'
  | 'structure'
  | 'features'
  | 'spatial'
  | 'exchange'
  | 'health';

export type DetailLevel = 'summary' | 'standard' | 'full';

export interface CadNode {
  id: string;
  type: string;
  category: KnowledgeCategory | 'file';
  label: string;
  attributes: Record<string, unknown>;
}

export interface CadEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  attributes: Record<string, unknown>;
}

export interface Fact {
  id: string;
  category: KnowledgeCategory;
  type: string;
  value: unknown;
  sourceIds: string[];
}

export interface Inference {
  id: string;
  category: KnowledgeCategory;
  type: string;
  value: unknown;
  evidence: Evidence;
}

export interface ProviderSummary {
  providers: ProviderInfo[];
  limitations: Limitation[];
}

export interface CadKnowledgeGraph {
  filePath: string;
  runId: string;
  providers: ProviderInfo[];
  brep: BRepModel;
  aag: AagModel;
  semantic: SemanticModel;
  nodes: CadNode[];
  edges: CadEdge[];
  facts: Fact[];
  inferences: Inference[];
  warnings: Warning[];
  limitations: Limitation[];
}

export interface AnalysisOptions {
  categories?: KnowledgeCategory[];
  detailLevel?: DetailLevel;
}

export interface ToolEnvelope<T> {
  ok: true;
  data: T;
}
