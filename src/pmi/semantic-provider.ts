import type { SemanticFact, SemanticModel } from '../types/semantic.js';
import { parseStepMetadata } from './metadata.js';

export class LightweightStepSemanticProvider {
  readonly name = 'lightweight-step';
  readonly capabilities = [
    'step_header',
    'schema_detection',
    'product_names',
    'pmi_hints',
    'product_structure',
    'authoring_info',
    'tolerance_detection',
    'assembly_hints',
  ] as const;

  async extract(filePath: string): Promise<SemanticModel> {
    const metadata = await parseStepMetadata(filePath);
    const hasGdt = metadata.pmiKeywords.some((keyword) =>
      ['GEOMETRIC_TOLERANCE', 'DATUM'].includes(keyword)
    );
    const hasDimensions = metadata.pmiKeywords.some((keyword) =>
      ['DIMENSIONAL_LOCATION', 'DIMENSIONAL_SIZE'].includes(keyword)
    );

    const facts: SemanticFact[] = [];

    if (metadata.schema) {
      facts.push({
        id: 'semantic:schema',
        type: 'step_schema',
        value: metadata.schema,
        source: this.name,
      });
    }

    if (metadata.organizationName) {
      facts.push({
        id: 'semantic:organization',
        type: 'authoring_organization',
        value: metadata.organizationName,
        source: this.name,
      });
    }

    facts.push(
      {
        id: 'semantic:product-count',
        type: 'product_count',
        value: metadata.productCount,
        source: this.name,
      },
      {
        id: 'semantic:has-assembly',
        type: 'assembly_hint',
        value: metadata.hasAssembly,
        source: this.name,
      },
      {
        id: 'semantic:tolerance-count',
        type: 'tolerance_entity_count',
        value: metadata.toleranceEntityCount,
        source: this.name,
      },
      {
        id: 'semantic:shape-rep-count',
        type: 'shape_representation_count',
        value: metadata.shapeRepresentationCount,
        source: this.name,
      }
    );

    return {
      provider: {
        name: this.name,
        capabilities: [...this.capabilities],
        limitations: [
          'This is lightweight STEP text parsing, not full EXPRESS/OWL semantic interpretation.',
          'PMI detection is keyword/entity presence only and does not prove semantic GD&T validity.',
          'Assembly detection is entity-name-based and may miss nested or referenced assemblies.',
          'Tolerance entity counting includes all occurrences of tolerance-class entities regardless of actual GD&T validity.',
        ],
      },
      filePath,
      schema: metadata.schema,
      applicationProtocol: metadata.applicationProtocol,
      productNames: metadata.productNames,
      productCount: metadata.productCount,
      authoringSystem: metadata.authoringSystem,
      organizationName: metadata.organizationName,
      hasAssembly: metadata.hasAssembly,
      toleranceEntityCount: metadata.toleranceEntityCount,
      shapeRepresentationCount: metadata.shapeRepresentationCount,
      pmi: {
        hasPmi: metadata.pmiKeywords.length > 0,
        hasGdt,
        hasDimensions,
        detectedKeywords: metadata.pmiKeywords,
        semanticStatus: metadata.pmiKeywords.length > 0 ? 'keyword_detected' : 'not_detected',
      },
      entityCounts: metadata.entityCounts,
      facts,
      limitations: [
        {
          source: this.name,
          message:
            'Semantic PMI/GD&T and validation properties require a richer STEP/OWL provider.',
        },
      ],
      provenance: [{ provider: this.name, sourceId: 'step:header', method: 'semantic' }],
    };
  }
}
