import type { CadEdge, CadKnowledgeGraph, CadNode } from './schema.js';

export function findNodes(graph: CadKnowledgeGraph, type?: string): CadNode[] {
  return type ? graph.nodes.filter((node) => node.type === type) : graph.nodes;
}

export function findEdges(graph: CadKnowledgeGraph, type?: string): CadEdge[] {
  return type ? graph.edges.filter((edge) => edge.type === type) : graph.edges;
}

export function getNode(graph: CadKnowledgeGraph, id: string): CadNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

export function getRelationshipsBetween(graph: CadKnowledgeGraph, ids: string[]): CadEdge[] {
  const targets = new Set(ids);
  return graph.edges.filter((edge) => targets.has(edge.from) && targets.has(edge.to));
}
