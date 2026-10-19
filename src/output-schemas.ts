import { z } from 'zod';
import { artifactReferenceSchema, subjectReferenceSchema } from './domain/artifact-reference.js';

const record = z.record(z.string(), z.unknown());
const vector3 = z.tuple([z.number(), z.number(), z.number()]);
const entityIdScheme = z.object({ authority: z.string(), idScheme: z.string() });
const coordinateFrame = z.object({
  id: z.string(),
  origin: vector3,
  axes: z.array(vector3).length(3),
  handedness: z.string(),
  units: z.string(),
});

const pagination = z.object({
  limit: z.number(),
  offset: z.number(),
  returned: z.number(),
  total_matched: z.number(),
  has_more: z.boolean(),
});

export const inspect = z
  .object({
    artifact: artifactReferenceSchema,
    coordinate_frame: coordinateFrame,
    size: z
      .object({
        bounding_box: z.object({ min: vector3, max: vector3 }),
        dimensions: z.object({ width: z.number(), height: z.number(), depth: z.number() }),
        volume: z.number(),
        surface_area: z.number(),
        units: z.object({ length: z.string(), area: z.string(), volume: z.string() }),
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

export const query = z.object({
  artifact: artifactReferenceSchema,
  entity_id_scheme: entityIdScheme,
  coordinate_frame: coordinateFrame,
  units: z.object({
    length: z.string(),
    area: z.string(),
    volume: z.string(),
    angle: z.string(),
  }),
  query: record,
  pagination,
  entities: z.array(record),
});

export const distance = z.object({
  artifact: artifactReferenceSchema,
  entity_id_scheme: entityIdScheme,
  coordinate_frame: coordinateFrame,
  subjects: z.array(subjectReferenceSchema),
  pair_count: z.number(),
  summary: record.optional(),
  pairs: z.array(record).optional(),
});

export const measure = z
  .object({
    artifact: artifactReferenceSchema,
    entity_id_scheme: entityIdScheme,
    coordinate_frame: coordinateFrame,
    subjects: z.array(subjectReferenceSchema),
    kind: z.string(),
    units: z.record(z.string(), z.string()),
  })
  .passthrough();

const batchMeasure = z.object({
  artifact: artifactReferenceSchema,
  faces: z.array(z.string()),
  face_count: z.number(),
  results: z.array(record),
});

export const thickness = batchMeasure;
export const draft = batchMeasure;

export const geometry = z.object({
  artifact: artifactReferenceSchema,
  measurement_type: z.string(),
  entity_count: z.number(),
  results: z.array(record),
});

export const diff = z.object({
  inputs: z.array(z.object({ role: z.string(), artifact: artifactReferenceSchema })).length(2),
  units: z.object({ length: z.string(), area: z.string(), volume: z.string() }),
  deltas: record,
  exchange: record.optional(),
  providers: record,
});

export { vector3 };
