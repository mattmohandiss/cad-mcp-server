import type { CadKnowledgeGraph, DetailLevel, KnowledgeCategory } from './schema.js';

export function providerSummary(graph: CadKnowledgeGraph) {
  return {
    providers: graph.providers.map((provider) => ({
      name: provider.name,
      capabilities: provider.capabilities,
      limitations: provider.limitations,
    })),
    limitations: graph.limitations,
  };
}

export function inspectProjection(graph: CadKnowledgeGraph) {
  return {
    filePath: graph.filePath,
    facts: {
      geometry: geometrySummary(graph),
      structure: {
        bodyCount: graph.brep.bodyCount,
        shapeType: graph.brep.shapeType,
        productNames: graph.semantic.productNames,
      },
      exchange: exchangeSummary(graph),
      health: healthSummary(graph),
    },
    inferences: graph.inferences,
    warnings: graph.warnings,
    limitations: graph.limitations,
    providers: providerSummary(graph),
  };
}

export function detailProjection(
  graph: CadKnowledgeGraph,
  categories: KnowledgeCategory[],
  detailLevel: DetailLevel
) {
  const selected = new Set(categories);
  return {
    filePath: graph.filePath,
    detailLevel,
    facts: graph.facts.filter((fact) => selected.has(fact.category)),
    inferences: graph.inferences.filter((inference) => selected.has(inference.category)),
    warnings: selected.has('health') ? graph.warnings : [],
    nodes:
      detailLevel === 'full'
        ? graph.nodes.filter((node) => node.category === 'file' || selected.has(node.category))
        : undefined,
    edges: detailLevel === 'full' ? graph.edges : undefined,
    providers: providerSummary(graph),
  };
}

export function geometrySummary(graph: CadKnowledgeGraph) {
  return {
    units: graph.brep.units,
    boundingBox: graph.brep.boundingBox,
    dimensions: graph.brep.dimensions,
    volume: graph.brep.volume,
    surfaceArea: graph.brep.surfaceArea,
    bodyCount: graph.brep.bodyCount,
    faceCount: graph.brep.faceCount,
    edgeStatistics: graph.brep.edgeStatistics,
    bodies: graph.brep.bodies,
  };
}

export function exchangeSummary(graph: CadKnowledgeGraph) {
  return {
    schema: graph.semantic.schema,
    applicationProtocol: graph.semantic.applicationProtocol,
    productNames: graph.semantic.productNames,
    authoringSystem: graph.semantic.authoringSystem,
    pmi: graph.semantic.pmi,
  };
}

export function healthSummary(graph: CadKnowledgeGraph) {
  const highWarnings = graph.warnings.filter((warning) => warning.severity === 'high').length;
  return {
    isValid: graph.brep.health.isValid,
    warningCount: graph.warnings.length,
    highWarnings,
    complexity: {
      bodyCount: graph.brep.bodyCount,
      faceCount: graph.brep.faceCount,
      edgeCount: graph.brep.edgeStatistics?.count,
    },
  };
}
