import { describe, expect, it } from 'vitest';
import { compareStepMetadata } from '../domain/compare.js';
import type { ParsedStepMetadata } from '../pmi/metadata.js';

const metadata = (overrides: Partial<ParsedStepMetadata> = {}): ParsedStepMetadata => ({
  schema: 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF',
  applicationProtocol: 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF',
  productNames: ['bracket'],
  productCount: 1,
  authoringSystem: 'CAD A',
  organizationName: 'Example',
  hasAssembly: false,
  toleranceEntityCount: 0,
  shapeRepresentationCount: 1,
  pmiKeywords: [],
  entityCounts: {},
  ...overrides,
});

describe('STEP semantic diff', () => {
  it('reports parsed document fact changes without interpreting intent', () => {
    expect(
      compareStepMetadata(
        metadata(),
        metadata({
          schema: 'AUTOMOTIVE_DESIGN',
          productNames: ['bracket', 'fastener'],
          productCount: 2,
          hasAssembly: true,
          organizationName: 'Other',
        }),
      ),
    ).toMatchObject({
      schema_changed: true,
      product_names_added: ['fastener'],
      product_names_removed: [],
      product_count_delta: 1,
      assembly_status_changed: true,
      organization_changed: true,
    });
  });
});
