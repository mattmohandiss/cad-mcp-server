import type { CadKnowledgeGraph } from './schema.js';

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
    aag: graph.aag.available
      ? {
          faceCount: graph.aag.nodes.length,
          adjacencyCount: graph.aag.edges.length,
        }
      : { available: false },
  };
}

export function exchangeSummary(graph: CadKnowledgeGraph) {
  return {
    schema: graph.semantic.schema,
    applicationProtocol: graph.semantic.applicationProtocol,
    productNames: graph.semantic.productNames,
    productCount: graph.semantic.productCount,
    authoringSystem: graph.semantic.authoringSystem,
    organizationName: graph.semantic.organizationName,
    hasAssembly: graph.semantic.hasAssembly,
    toleranceEntityCount: graph.semantic.toleranceEntityCount,
    shapeRepresentationCount: graph.semantic.shapeRepresentationCount,
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
