import type { AagModel } from '../providers/aag.js';
import type { BRepModel } from '../providers/brep.js';
import type { SemanticModel } from '../providers/semantic.js';
import type { Limitation, Warning } from '../providers/schema.js';
import { makeId, makeWarningId } from '../utils/ids.js';
import type { CadEdge, CadKnowledgeGraph, CadNode, Fact, Inference } from './schema.js';

interface BuildInput {
  filePath: string;
  brep: BRepModel;
  aag: AagModel;
  semantic: SemanticModel;
}

export function buildCadKnowledgeGraph(input: BuildInput): CadKnowledgeGraph {
  const { filePath, brep, aag, semantic } = input;
  const nodes: CadNode[] = [];
  const edges: CadEdge[] = [];
  const facts: Fact[] = [];
  const inferences: Inference[] = [];
  const limitations: Limitation[] = [
    ...brep.provider.limitations.map((message) => ({ source: brep.provider.name, message })),
    ...aag.limitations,
    ...semantic.limitations,
  ];
  const warnings: Warning[] = [...brep.health.warnings];

  nodes.push({
    id: 'file:0',
    type: 'file',
    category: 'file',
    label: filePath,
    attributes: { filePath },
  });

  nodes.push({
    id: 'measurement:geometry',
    type: 'measurement',
    category: 'geometry',
    label: 'Geometry summary',
    attributes: {
      units: brep.units,
      boundingBox: brep.boundingBox,
      dimensions: brep.dimensions,
      volume: brep.volume,
      surfaceArea: brep.surfaceArea,
      bodyCount: brep.bodyCount,
      faceCount: brep.faceCount,
      edgeStatistics: brep.edgeStatistics,
    },
  });
  edges.push(edge('edge:file-measurement', 'measured_by', 'file:0', 'measurement:geometry'));

  facts.push(
    fact('fact:dimensions', 'geometry', 'dimensions', brep.dimensions, ['measurement:geometry']),
    fact('fact:volume', 'geometry', 'volume', brep.volume, ['measurement:geometry']),
    fact('fact:surface-area', 'geometry', 'surface_area', brep.surfaceArea, [
      'measurement:geometry',
    ]),
    fact('fact:body-count', 'geometry', 'body_count', brep.bodyCount, ['measurement:geometry'])
  );

  if (brep.faceCount !== undefined) {
    facts.push(
      fact('fact:face-count', 'topology', 'face_count', brep.faceCount, ['measurement:geometry'])
    );
  }

  if (brep.edgeStatistics) {
    facts.push(
      fact('fact:edge-statistics', 'topology', 'edge_statistics', brep.edgeStatistics, [
        'measurement:geometry',
      ])
    );
  }

  for (const body of brep.bodies) {
    nodes.push({
      id: body.id,
      type: 'body',
      category: 'geometry',
      label: `Body ${body.index}`,
      attributes: { ...body },
    });
    edges.push(edge(`edge:file-${body.id}`, 'contains', 'file:0', body.id));
  }

  for (const feature of [...brep.featureHints, ...aag.features]) {
    nodes.push({
      id: feature.id,
      type: 'feature_candidate',
      category: 'features',
      label: feature.type,
      attributes: { ...feature },
    });
    edges.push(
      edge(`edge:evidence-${feature.id}`, 'evidence_for', 'measurement:geometry', feature.id)
    );
    inferences.push({
      id: feature.id,
      category: 'features',
      type: feature.type,
      value: feature.dimensions ?? true,
      evidence: feature.evidence,
    });
  }

  nodes.push({
    id: 'exchange:metadata',
    type: 'exchange_metadata',
    category: 'exchange',
    label: 'STEP exchange metadata',
    attributes: {
      schema: semantic.schema,
      applicationProtocol: semantic.applicationProtocol,
      productNames: semantic.productNames,
      authoringSystem: semantic.authoringSystem,
      pmi: semantic.pmi,
      entityCounts: semantic.entityCounts,
    },
  });
  edges.push(edge('edge:file-exchange', 'contains', 'file:0', 'exchange:metadata'));

  facts.push(
    fact('fact:schema', 'exchange', 'schema', semantic.schema ?? 'unknown', ['exchange:metadata']),
    fact('fact:pmi-summary', 'exchange', 'pmi_summary', semantic.pmi, ['exchange:metadata'])
  );

  if (!aag.available) {
    const warning: Warning = {
      id: makeWarningId('aag_unavailable'),
      type: 'aag_unavailable',
      severity: 'medium',
      message: 'AAG-backed face adjacency and feature recognition are unavailable.',
      sourceIds: ['file:0'],
    };
    warnings.push(warning);
    nodes.push({
      id: warning.id,
      type: 'warning',
      category: 'health',
      label: warning.message,
      attributes: { ...warning },
    });
    edges.push(edge('edge:file-aag-warning', 'warns_about', warning.id, 'file:0'));
  }

  return {
    filePath,
    runId: makeId('run', Date.now()),
    providers: [brep.provider, aag.provider, semantic.provider],
    brep,
    aag,
    semantic,
    nodes,
    edges,
    facts,
    inferences,
    warnings,
    limitations,
  };
}

function fact(
  id: string,
  category: Fact['category'],
  type: string,
  value: unknown,
  sourceIds: string[]
): Fact {
  return { id, category, type, value, sourceIds };
}

function edge(id: string, type: string, from: string, to: string): CadEdge {
  return { id, type, from, to, attributes: {} };
}
