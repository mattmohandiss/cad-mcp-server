import { z } from 'zod';

const record = z.record(z.string(), z.unknown());
const vector3 = z.array(z.number()).length(3);

const pagination = z.object({
  limit: z.number(),
  offset: z.number(),
  returned: z.number(),
  total_matched: z.number(),
  has_more: z.boolean(),
});

const group = z.object({
  id: z.string(),
  key: record,
  entity_count: z.number(),
  sample_entity_ids: z.array(z.string()),
  sample_entity_limit: z.number(),
  sample_is_complete: z.boolean(),
  summary: record,
});

export const inspect = z
  .object({
    file_path: z.string(),
    size: z
      .object({
        bounding_box: z.object({ min: vector3, max: vector3 }),
        dimensions: z.object({ width: z.number(), height: z.number(), depth: z.number() }),
        volume: z.number(),
        surface_area: z.number(),
        units: z.string(),
      })
      .optional(),
    structure: z
      .object({
        body_count: z.number(),
        is_assembly: z.boolean(),
        component_occurrences: z.array(z.string()),
      })
      .optional(),
    health: z
      .object({
        is_valid: z.boolean(),
        complexity: z.object({
          body_count: z.number(),
          face_count: z.number(),
          edge_count: z.number(),
        }),
      })
      .optional(),
  })
  .passthrough();

export const modelReference = z.object({
  source: z.string(),
  revision: z.string(),
  units: z.string().optional(),
});

export const query = z.object({
  file_path: z.string(),
  units: z.object({
    length: z.string(),
    area: z.string(),
    volume: z.string(),
    angle: z.string(),
  }),
  coordinate_system: z.object({
    origin: z.string(),
    axes: z.string(),
    handedness: z.string(),
  }),
  query: record,
  statistics: record,
  pagination,
  entities: z.array(record),
  groups: z.array(group),
  model_reference: modelReference.optional(),
});

export const distance = z.object({
  file_path: z.string(),
  sources: z.array(z.string()),
  targets: z.array(z.string()),
  pair_count: z.number(),
  summary: record.optional(),
  pairs: z.array(record).optional(),
});

// Unified measure tool output. Kind-specific fields are dynamic, so keep it permissive.
export const measure = z
  .object({
    file_path: z.string(),
    kind: z.string(),
  })
  .passthrough();

const batchMeasure = z.object({
  file_path: z.string(),
  faces: z.array(z.string()),
  face_count: z.number(),
  results: z.array(record),
});

export const thickness = batchMeasure;
export const draft = batchMeasure;

export const geometry = z.object({
  file_path: z.string(),
  measurement_type: z.string(),
  entity_count: z.number(),
  results: z.array(record),
});

export const diff = z.object({
  files: z.object({ a: z.string(), b: z.string() }),
  deltas: record,
  exchange: record.optional(),
  providers: record,
});

// Kept exported for future schema refinements of dynamic CAD entity fields.
export { vector3 };
