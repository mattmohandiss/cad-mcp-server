import type { CadKnowledgeGraph } from './schema.js';

export function inspectProjection(graph: CadKnowledgeGraph) {
  return {
    identity: {
      product_names: graph.semantic.productNames,
      authoring_system: graph.semantic.authoringSystem,
      organization_name: graph.semantic.organizationName,
    },
    size: {
      bounding_box: graph.brep.boundingBox,
      dimensions: graph.brep.dimensions,
      volume: graph.brep.volume,
      surface_area: graph.brep.surfaceArea,
      units: graph.brep.units,
    },
    structure: {
      body_count: graph.brep.bodyCount,
      shape_type: graph.brep.shapeType,
      is_assembly: graph.semantic.hasAssembly,
      product_count: graph.semantic.productCount,
      schema: graph.semantic.schema,
      application_protocol: graph.semantic.applicationProtocol,
    },
    health: {
      is_valid: graph.brep.health.isValid,
      warning_count: graph.warnings.length,
      high_warning_count: graph.warnings.filter((w) => w.severity === 'high').length,
      complexity: {
        body_count: graph.brep.bodyCount,
        face_count: graph.brep.faceCount,
        edge_count: graph.brep.edgeStatistics?.count,
      },
    },
    pmi: {
      has_pmi: graph.semantic.pmi?.hasGdt || graph.semantic.pmi?.hasDimensions || false,
      has_gdt: graph.semantic.pmi?.hasGdt || false,
      has_dimensions: graph.semantic.pmi?.hasDimensions || false,
      semantic_status: graph.semantic.pmi?.semanticStatus || 'not_detected',
      tolerance_entity_count: graph.semantic.toleranceEntityCount,
    },
    edges: graph.brep.edgeStatistics
      ? {
          total: graph.brep.edgeStatistics.count,
          by_curve_type: graph.brep.edgeStatistics.byCurveType,
          by_length_bucket: graph.brep.edgeStatistics.byLengthRange,
          length_range: {
            min: graph.brep.edgeStatistics.minLength,
            max: graph.brep.edgeStatistics.maxLength,
          },
        }
      : undefined,
    warnings: graph.warnings,
    limitations: graph.limitations,
  };
}
