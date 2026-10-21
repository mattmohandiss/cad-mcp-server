import { describe, expect, it } from 'vitest';
import { MEASURE_KIND_SPECS } from '../src/tools/measure.js';
import { TOOL_REGISTRY } from '../src/tools/registry.js';

/**
 * The `find_entities` description tells the caller which measure kinds take
 * sources/targets, because passing the wrong field family is a common mistake
 * (the server answers with `entity_ids: ray requires entity_ids`). That
 * sentence previously restated the rule by hand and went stale: it claimed
 * `ray` took sources/targets. Assert the advertised text agrees with the spec
 * table that actually enforces it.
 */
const findEntities = TOOL_REGISTRY.find((tool) => tool.name === 'find_entities');

describe('find_entities description matches the measure spec table', () => {
  it('is registered', () => {
    expect(findEntities).toBeDefined();
  });

  it('names exactly the kinds that require sources/targets', () => {
    const sourcesKinds = Object.entries(MEASURE_KIND_SPECS)
      .filter(([, spec]) => spec.requires.includes('sources'))
      .map(([kind]) => kind);
    expect(sourcesKinds).toEqual(['distance']);
    expect(findEntities?.description).toContain(`${sourcesKinds.join(', ')} takes sources/targets`);
  });

  it('says the remaining kinds take entity_ids and points at cad://help', () => {
    const entityKinds = Object.entries(MEASURE_KIND_SPECS)
      .filter(([, spec]) => spec.requires.includes('entity_ids'))
      .map(([kind]) => kind);
    // Every kind is covered by one rule or the other.
    expect(entityKinds.length + 1).toBe(Object.keys(MEASURE_KIND_SPECS).length);
    expect(findEntities?.description).toContain('every other measure kind takes');
    expect(findEntities?.description).toContain('cad://help lists the required fields');
  });
});
