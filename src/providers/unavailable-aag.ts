import type { AagInput, AagModel, AagProvider } from './aag.js';

export class UnavailableAagProvider implements AagProvider {
  readonly name = 'aag-unavailable';
  readonly capabilities = [];

  async build(input: AagInput): Promise<AagModel> {
    void input;
    return {
      provider: {
        name: this.name,
        capabilities: [],
        limitations: [
          'No true AAG provider is configured. Face adjacency, vexity, and AAG-backed feature recognition are unavailable.',
        ],
      },
      available: false,
      nodes: [],
      edges: [],
      features: [],
      limitations: [
        {
          source: this.name,
          message:
            'AAG is intentionally marked unavailable rather than approximated from incomplete topology.',
        },
      ],
      provenance: [{ provider: this.name, method: 'derived' }],
    };
  }
}
