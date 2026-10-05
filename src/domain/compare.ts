import type { ParsedStepMetadata } from '../pmi/metadata.js';

/** Compare parsed STEP document facts without inferring engineering intent. */
export function compareStepMetadata(a: ParsedStepMetadata, b: ParsedStepMetadata) {
  const namesA = new Set(a.productNames);
  const namesB = new Set(b.productNames);
  return {
    schema_changed: a.schema !== b.schema,
    schema_a: a.schema,
    schema_b: b.schema,
    product_names_added: b.productNames.filter((name) => !namesA.has(name)),
    product_names_removed: a.productNames.filter((name) => !namesB.has(name)),
    product_count_delta: b.productCount - a.productCount,
    assembly_status_changed: a.hasAssembly !== b.hasAssembly,
    has_assembly_a: a.hasAssembly,
    has_assembly_b: b.hasAssembly,
    authoring_system_changed: a.authoringSystem !== b.authoringSystem,
    authoring_system_a: a.authoringSystem,
    authoring_system_b: b.authoringSystem,
    organization_changed: a.organizationName !== b.organizationName,
    organization_a: a.organizationName,
    organization_b: b.organizationName,
  };
}
