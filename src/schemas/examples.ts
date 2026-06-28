/**
 * input_examples for the 4-tool surface.
 *
 * Per Anthropic's tool-use guidance:
 *   - Use realistic data (real names, plausible values)
 *   - Show variety: minimal, partial, full specification patterns
 *   - Keep concise: 1-5 per tool
 *   - Focus on ambiguity (where correct usage isn't obvious from schema alone)
 *
 * query_step has 6 examples: 1 minimal + 5 full/partial
 * transact_step has 4 examples: 1 minimal + 3 full
 */

import type { ToolName } from './tool-schemas.js';

type Example = Record<string, unknown>;

const queryStepExamples: Example[] = [
  /* 1. Minimal: just required fields (entity lookup) */
  {
    file_path: 'model.step',
    entities: 'faces',
    entity_ids: ['face:5', 'face:6'],
  },

  /* 2. Full: filter + sort + limit + select (sort and select fields) */
  {
    file_path: 'model.step',
    entities: 'faces',
    filter: { surface_type: 'cylinder', radius_min: 0.1 },
    sort: { by: 'radius', direction: 'asc' },
    limit: 10,
    select: ['id', 'axis', 'radius'],
  },

  /* 3. Full: group_by (the old find_coaxial_cylinders use case) */
  {
    file_path: 'model.step',
    entities: 'faces',
    filter: { surface_type: 'cylinder' },
    group_by: ['axis'],
    select: ['diameter', 'extent_along_axis', 'face_ids'],
  },

  /* 4. Full: measure + aggregate (wall thickness distribution) */
  {
    file_path: 'model.step',
    entities: 'faces',
    measure: [{ op: 'ray_test_grid', direction: [0, 0, 1], spacing_mm: 2.0 }],
    aggregate: [
      'min:hit_distance',
      'max:hit_distance',
      'avg:hit_distance',
      'count:hit_distance',
    ],
  },

  /* 5. Partial: filter + select (new Tier A: validity_status) */
  {
    file_path: 'model.step',
    entities: 'edges',
    filter: { validity_status: 'self_intersecting' },
    select: ['id', 'length', 'validity_message'],
  },

  /* 6. Full: XDE PMI with linked_to filter */
  {
    file_path: 'model.step',
    entities: 'pmi',
    filter: { linked_to: { surface_type: 'cylinder' }, tolerance_subtype: 'position' },
    select: ['value', 'datum_refs', 'linked_to'],
  },
];

const transactStepExamples: Example[] = [
  /* 1. Minimal: single query step */
  {
    file_path: 'model.step',
    pipeline: [
      { op: 'query', params: { entities: 'faces', filter: { surface_type: 'plane' } } },
    ],
  },

  /* 2. Full: find blind holes (query + for_each + filter + select) */
  {
    file_path: 'model.step',
    pipeline: [
      {
        op: 'query',
        params: {
          entities: 'faces',
          filter: { surface_type: 'cylinder' },
          group_by: ['axis'],
        },
      },
      {
        op: 'for_each',
        do: [
          { op: 'query', params: { measure: { op: 'ray_test_segment', origin: 'extent_max', direction: [0, 0, 1] } } },
          { op: 'query', params: { measure: { op: 'ray_test_segment', origin: 'extent_min', direction: [0, 0, -1] } } },
        ],
      },
      { op: 'filter_results', where: 'pos_hits.empty OR neg_hits.empty' },
      { op: 'select', fields: ['axis', 'diameter', 'pos_hits.count', 'neg_hits.count'] },
    ],
  },

  /* 3. Full: per-part bounding boxes in an assembly (XDE walk) */
  {
    file_path: 'assembly.step',
    pipeline: [
      {
        op: 'walk_assembly',
        params: {
          per_node: [
            {
              op: 'query',
              params: {
                entities: 'bodies',
                aggregate: ['min:volume', 'max:volume', 'count'],
              },
            },
          ],
        },
      },
    ],
  },

  /* 4. Full: features violating a clearance rule */
  {
    file_path: 'model.step',
    pipeline: [
      {
        op: 'query',
        params: {
          entities: 'faces',
          filter: { surface_type: 'cylinder', radius_min: 5.0 },
        },
      },
      {
        op: 'for_each',
        do: [{ op: 'query', params: { measure: { op: 'distance', to: 'face:0' } } }],
      },
      { op: 'filter_results', where: 'distance < 2.0' },
      { op: 'select', fields: ['id', 'axis', 'radius', 'distance'] },
    ],
  },
];

const inspectStepExamples: Example[] = [
  { file_path: 'model.step' },
];

const diffStepExamples: Example[] = [
  {
    baseline_file_path: 'model_v1.step',
    comparison_file_path: 'model_v2.step',
  },
];

export const toolExamples: Record<ToolName, Example[]> = {
  query_step: queryStepExamples,
  transact_step: transactStepExamples,
  inspect_step: inspectStepExamples,
  diff_step: diffStepExamples,
};
