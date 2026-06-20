import type { Limitation, ProviderInfo, Provenance } from './schema.js';

export type AagCapability = 'face_adjacency';

export interface AagInput {
  filePath: string;
}

export interface AagNode {
  id: string;
  faceId: string;
  attributes: Record<string, string | number | boolean>;
}

export interface AagEdge {
  id: string;
  from: string;
  to: string;
  attributes: {
    sharedEdgeIds: string[];
    vexity?: 'concave' | 'convex' | 'smooth' | 'unknown';
    dihedralAngleDeg?: number;
  };
}

export interface AagModel {
  provider: ProviderInfo;
  available: boolean;
  nodes: AagNode[];
  edges: AagEdge[];
  limitations: Limitation[];
  provenance: Provenance[];
}

export interface AagProvider {
  name: string;
  capabilities: readonly AagCapability[];
  build(input: AagInput): Promise<AagModel>;
}
