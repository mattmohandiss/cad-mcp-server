import type { SemanticModel, SemanticProvider } from '../semantic.js';
import { parseStepMetadata } from './metadata.js';

export class LightweightStepSemanticProvider implements SemanticProvider {
  readonly name = 'lightweight-step';
  readonly capabilities = [
    'step_header',
    'schema_detection',
    'product_names',
    'pmi_hints',
  ] as const;

  async extract(filePath: string): Promise<SemanticModel> {
    const metadata = await parseStepMetadata(filePath);
    const hasGdt = metadata.pmiKeywords.some((keyword) =>
      ['GEOMETRIC_TOLERANCE', 'DATUM'].includes(keyword)
    );
    const hasDimensions = metadata.pmiKeywords.some((keyword) =>
      ['DIMENSIONAL_LOCATION', 'DIMENSIONAL_SIZE'].includes(keyword)
    );

    return {
      provider: {
        name: this.name,
        capabilities: [...this.capabilities],
        limitations: [
          'This is lightweight STEP text parsing, not full EXPRESS/OWL semantic interpretation.',
          'PMI detection is keyword/entity presence only and does not prove semantic GD&T validity.',
        ],
      },
      filePath,
      schema: metadata.schema,
      applicationProtocol: metadata.applicationProtocol,
      productNames: metadata.productNames,
      authoringSystem: metadata.authoringSystem,
      pmi: {
        hasPmi: metadata.pmiKeywords.length > 0,
        hasGdt,
        hasDimensions,
        detectedKeywords: metadata.pmiKeywords,
        semanticStatus: metadata.pmiKeywords.length > 0 ? 'keyword_detected' : 'not_detected',
      },
      entityCounts: metadata.entityCounts,
      facts: [
        ...(metadata.schema
          ? [
              {
                id: 'semantic:schema',
                type: 'step_schema',
                value: metadata.schema,
                source: this.name,
              },
            ]
          : []),
      ],
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
