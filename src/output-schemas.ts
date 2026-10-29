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
        bounding_box: z.object({
          min: vector3,
          max: vector3,
          method: z.literal('conservative-envelope'),
          note: z.string(),
        }),
        dimensions: z.object({ width: z.number(), height: z.number(), depth: z.number() }),
        volume: z.number().nullable(),
        volume_available: z.boolean(),
        volume_basis: z.enum(['solid-only', 'none']),
        surface_area: z.number(),
        units: z.object({ length: z.string(), area: z.string(), volume: z.string() }),
      })
      .optional(),
    structure: z
      .object({
        body_count: z.number(),
        shell_count: z.number(),
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
  unit_note: z.string().optional(),
  bounds_method: z.literal('conservative-envelope').optional(),
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
  unit_note: z.string().optional(),
  deltas: record,
  exchange: record.optional(),
  pmi: record,
  providers: record,
});

export const pmi = z.object({
  artifact: artifactReferenceSchema,
  coordinate_frame: coordinateFrame,
  unit_note: z.string().optional(),
  units: z.object({ length: z.string() }),
  /**
   * `semantic` — readable callouts; `graphical-only` — callouts that exist only as
   * graphics; `none` — nothing declared. An empty section means something different in
   * each case, and conflating the last two is how a drawn requirement gets reported as no
   * requirement at all.
   */
  pmi_kind: z.enum(['semantic', 'graphical-only', 'none']),
  counts: z.object({
    dimensions: z.number(),
    geometric_tolerances: z.number(),
    /** Datum references: one per tolerance frame that names the datum. */
    datum_references: z.number(),
    /** Distinct datum names, which is how many datums the model declares. */
    unique_datums: z.number(),
    presentation_skipped: z.number(),
  }),
  dimensions: z
    .array(
      z.object({
        kind: z.string(),
        nominal: z.number(),
        /**
         * False when the magnitude could not be read and is reported as 0.0. A caller
         * must not compare a measurement against `nominal` when this is false.
         */
        value_resolved: z.boolean(),
        /** `plus-minus`, `range`, `class`, or `none`. */
        tolerance_form: z.string(),
        upper_deviation: z.number().optional(),
        lower_deviation: z.number().optional(),
        lower_bound: z.number().optional(),
        upper_bound: z.number().optional(),
        entity_ids: z.array(z.string()).optional(),
        secondary_entity_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  geometric_tolerances: z
    .array(
      z.object({
        kind: z.string(),
        value: z.number(),
        zone_shape: z.string(),
        material_requirement: z.string(),
        zone_modifier: z.number().optional(),
        value_resolved: z.boolean(),
        datums: z
          .array(
            z.object({
              name: z.string(),
              position: z.number(),
              entity_ids: z.array(z.string()).optional(),
            }),
          )
          .optional(),
        /** Datum references the reader could not attach to geometry, by name. */
        unlocated_datums: z.array(z.string()).optional(),
        entity_ids: z.array(z.string()).optional(),
        secondary_entity_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  datums: z
    .array(
      z.object({
        name: z.string(),
        position: z.number(),
        is_target: z.boolean(),
        target_type: z.string().optional(),
        /** The shapes this datum is attached to, so a tolerance referencing it can be checked. */
        entity_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  characteristics: z
    .array(
      z.object({
        requirement: z.string(),
        state: z.enum(['satisfied', 'violated', 'unresolved', 'conflicting', 'not-applicable']),
        entity_ids: z.array(z.string()),
        nominal: z.number().optional(),
        measured: z.number().optional(),
        deviation: z.number().optional(),
        reason: z
          .enum([
            'value-unresolved',
            'basic-dimension',
            'no-tolerance',
            'unsupported-surface',
            'needs-frame',
            'faces-disagree',
            'duplicate-disagrees',
          ])
          .optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()),
});

export { vector3 };
