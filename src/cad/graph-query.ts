import { findEdges, findNodes, getRelationshipsBetween } from './graph.js';
import type { CadKnowledgeGraph } from './schema.js';

export interface GraphQuery {
  find: 'nodes' | 'edges' | 'features' | 'relationships' | 'warnings' | 'evidence';
  type?: string;
  where?: Record<string, string | number | boolean>;
  between?: string[];
  id?: string;
}

export function queryGraph(graph: CadKnowledgeGraph, query: GraphQuery) {
  if (query.find === 'nodes') return { results: findNodes(graph, query.type) };
  if (query.find === 'edges') return { results: findEdges(graph, query.type) };
  if (query.find === 'features') return { results: filterValues(graph.inferences, query.where) };
  if (query.find === 'warnings') return { results: filterValues(graph.warnings, query.where) };
  if (query.find === 'relationships') {
    return { results: query.between ? getRelationshipsBetween(graph, query.between) : graph.edges };
  }
  if (query.find === 'evidence') {
    return { results: graph.inferences.filter((inference) => inference.id === query.id) };
  }
  return { results: [] };
}

function filterValues<T>(values: T[], where?: Record<string, string | number | boolean>): T[] {
  if (!where) return values;

  return values.filter((value) =>
    Object.entries(where).every(([key, expected]) => {
      const candidate = value as Record<string, unknown>;
      return candidate[key] === expected;
    })
  );
}
