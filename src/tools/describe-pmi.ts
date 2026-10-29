import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import { memoiseByRevision } from '../sidecar/memo.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
  stepModelFrame,
  unitNote,
} from '../domain/artifact-reference.js';
import type { SidecarClient } from '../sidecar/client.js';
import type { SidecarEntity, SidecarPmi } from '../sidecar/operations.js';
import {
  evaluateDimensions,
  faceSetKey,
  type Characteristic,
  type FaceProperty,
} from '../domain/pmi-characteristics.js';

const baseSchema = z
  .object({
    ...artifactLocatorSchema.shape,
    include: z
      .array(z.enum(['dimensions', 'tolerances', 'datums']))
      .optional()
      .meta({
        description:
          'Sections to include: dimensions, tolerances, datums. Default: all three. Example: ["tolerances"].',
      }),
  })
  .strict();

export const schema = z.preprocess(stripNulls, baseSchema);

export const examples = [
  { uri: 'file:///work/part.step' },
  { uri: 'file:///work/part.step', include: ['tolerances'] },
];

const DEFAULT_INCLUDE = new Set(['dimensions', 'tolerances', 'datums']);

/**
 * How a file states its requirements, which decides what an empty section means.
 *
 * `machineReadable` is the count of callouts a program can actually parse. When that is
 * zero but the file carries presentation annotations, the requirements are *visible* and
 * *not readable* — a materially different answer from "there are none", and the one an
 * engineer most often needs to hear, because graphical PMI is the common case in real
 * drawings and the semantic encodings our join can read are the exception.
 * @param machineReadable - dimensions, geometric tolerances and datums read as data.
 * @param presentationSkipped - callouts that exist only as graphics.
 * @returns the kind this file's PMI is.
 */
export function pmiKind(
  machineReadable: number,
  presentationSkipped: number,
): 'semantic' | 'graphical-only' | 'none' {
  if (machineReadable > 0) return 'semantic';
  return presentationSkipped > 0 ? 'graphical-only' : 'none';
}

/** A dimensional callout, in the unit `units.length` reports. */
export type PmiDimension = {
  kind: string;
  nominal: number;
  /**
   * False when OCCT could not read the magnitude and left it at 0.0, which is the value
   * a genuine zero callout also reports. A location dimension that defines a tolerance
   * frame legitimately has no value of its own, so a caller must not compare a
   * measurement against `nominal` when this is false.
   */
  value_resolved: boolean;
  /** Which tolerance form the callout carries: `plus-minus`, `range`, `class` or `none`. */
  tolerance_form: string;
  upper_deviation?: number;
  lower_deviation?: number;
  lower_bound?: number;
  upper_bound?: number;
  entity_ids?: string[];
  secondary_entity_ids?: string[];
};

/** A geometric tolerance, in the unit `units.length` reports. */
export type PmiTolerance = {
  kind: string;
  value: number;
  zone_shape: string;
  material_requirement: string;
  zone_modifier?: number;
  value_resolved: boolean;
  /** Datum references in frame order, each naming the shapes its datum is attached to. */
  datums?: Array<{ name: string; position: number; entity_ids?: string[] }>;
  /**
   * Datum references the reader could not attach to geometry, by name.
   *
   * A datum without faces cannot anchor a tolerance frame, so a tolerance that names one
   * is not evaluable however well its magnitude was read. Absent when every reference was
   * located, or when the tolerance names no datum.
   */
  unlocated_datums?: string[];
  entity_ids?: string[];
  secondary_entity_ids?: string[];
};

export type PmiDatum = {
  name: string;
  position: number;
  is_target: boolean;
  target_type?: string;
  /** The shapes this datum is attached to. */
  entity_ids?: string[];
};

export type DescribePmiResult = {
  artifact: ReturnType<typeof artifactReference>;
  coordinate_frame: ReturnType<typeof stepModelFrame>;
  unit_note: string;
  units: { length: string };
  counts: {
    dimensions: number;
    geometric_tolerances: number;
    /** Datum references: one per tolerance frame that names the datum. */
    datum_references: number;
    /** Distinct datum names, which is how many datums the model declares. */
    unique_datums: number;
    presentation_skipped: number;
  };
  /**
   * How this file states its requirements, which is what an empty section means.
   *
   * `semantic` — callouts readable as data, which the join can check.
   * `graphical-only` — callouts exist but only as graphics. The requirements are visible
   * and not readable, so they must come from the drawing or the engineer. Saying "this file
   * declares no PMI" here would be wrong in the way that matters.
   * `none` — the file declares nothing at all.
   */
  pmi_kind: 'semantic' | 'graphical-only' | 'none';
  dimensions?: PmiDimension[];
  geometric_tolerances?: PmiTolerance[];
  datums?: PmiDatum[];
  /**
   * One row per dimensional callout, checked against the faces it controls.
   *
   * Present only when dimensions are included, because every row derives from one. A row
   * that could not be checked says why rather than leaving the caller to guess.
   */
  characteristics?: Characteristic[];
  warnings: string[];
};

/**
 * OCCT reports GD&T in millimetres whatever unit the geometry was read in, so
 * convert it to the artifact's declared unit. Returning it raw would be wrong by
 * 25.4x on an inch part and would not compare with any measurement from the same
 * artifact.
 */
export function toModelUnit(value: number, millimetresPerUnit: number): number {
  return value / millimetresPerUnit;
}

export function shapePmi(
  pmi: SidecarPmi,
  millimetresPerUnit: number,
): {
  dimensions: PmiDimension[];
  geometric_tolerances: PmiTolerance[];
  datums: PmiDatum[];
} {
  const scale = (value: number) => toModelUnit(value, millimetresPerUnit);
  return {
    dimensions: pmi.dimensions.map((dimension) => {
      const entry: PmiDimension = {
        kind: dimension.kind,
        nominal: scale(dimension.nominal),
        value_resolved: dimension.valueResolved,
        tolerance_form: dimension.toleranceForm,
      };
      if (dimension.upperDeviation !== undefined) {
        entry.upper_deviation = scale(dimension.upperDeviation);
      }
      if (dimension.lowerDeviation !== undefined) {
        // OCCT reports both deviations as magnitudes. A deviation is an offset from the
        // nominal and the lower one is below it, so it is negated here: emitting a positive
        // "lower deviation" makes every plus-minus callout read as a limit above nominal,
        // which is how a nominal model reports a violation on every dimension it has.
        entry.lower_deviation = -scale(dimension.lowerDeviation);
      }
      if (dimension.lowerBound !== undefined) entry.lower_bound = scale(dimension.lowerBound);
      if (dimension.upperBound !== undefined) entry.upper_bound = scale(dimension.upperBound);
      if (dimension.entityIds) entry.entity_ids = dimension.entityIds;
      if (dimension.secondaryEntityIds) entry.secondary_entity_ids = dimension.secondaryEntityIds;
      return entry;
    }),
    geometric_tolerances: pmi.geometricTolerances.map((tolerance) => {
      const entry: PmiTolerance = {
        kind: tolerance.kind,
        value: scale(tolerance.value),
        zone_shape: tolerance.zoneShape,
        material_requirement: tolerance.materialRequirement,
        value_resolved: tolerance.valueResolved,
      };
      if (tolerance.zoneModifier !== undefined) entry.zone_modifier = scale(tolerance.zoneModifier);
      if (tolerance.datums) {
        entry.datums = tolerance.datums.map((datum) => ({
          name: datum.name,
          position: datum.position,
          ...(datum.entityIds === undefined ? {} : { entity_ids: datum.entityIds }),
        }));
        // OCCT reads a datum's shape only from some of the encodings STEP allows: a
        // `geometric_item_specific_usage` becomes a reference shape, an
        // `item_identified_representation_usage` does not. Saying which references are
        // unlocated is the difference between "not checked" and "not checkable".
        const unlocated = tolerance.datums
          .filter((datum) => datum.entityIds === undefined)
          .map((datum) => datum.name);
        if (unlocated.length > 0) entry.unlocated_datums = unlocated;
      }
      if (tolerance.entityIds) entry.entity_ids = tolerance.entityIds;
      if (tolerance.secondaryEntityIds) entry.secondary_entity_ids = tolerance.secondaryEntityIds;
      return entry;
    }),
    datums: pmi.datums.map((datum) => {
      const entry: PmiDatum = {
        name: datum.name,
        position: datum.position,
        is_target: datum.isTarget,
      };
      if (datum.targetType) entry.target_type = datum.targetType;
      if (datum.entityIds) entry.entity_ids = datum.entityIds;
      return entry;
    }),
  };
}

/**
 * The face properties the join needs, read off the sidecar's opaque entity record.
 * @param face - one face entity.
 * @returns its surface type and diameter, where the sidecar reports them.
 */
function faceProperties(face: SidecarEntity): FaceProperty {
  const surfaceType = face['surface_type'];
  const diameter = face['diameter'];
  return {
    ...(typeof surfaceType === 'string' ? { surface_type: surfaceType } : {}),
    ...(typeof diameter === 'number' ? { diameter } : {}),
  };
}

/**
 * Check every dimensional callout against the faces it controls.
 *
 * One extra read of the same revision, not a second interpretation of it: the callout and
 * the value come from the same artifact, so a row cannot describe a mixture of revisions.
 * @param shaped - the callouts, already converted to the model's unit.
 * @param client - sidecar client.
 * @param modelId - the open model.
 * @returns one characteristic per callout.
 */
async function evaluate(
  shaped: ReturnType<typeof shapePmi>,
  client: SidecarClient,
  modelId: number,
): Promise<Characteristic[]> {
  const faceIds = [
    ...new Set(shaped.dimensions.flatMap((dimension) => dimension.entity_ids ?? [])),
  ];
  const faces =
    faceIds.length === 0
      ? []
      : (
          await client.request('findEntities', {
            modelId,
            entityType: 'face',
            entityIds: faceIds,
            limit: faceIds.length,
          })
        ).result.entities;
  const properties = new Map<string, FaceProperty>(
    faces.map((face) => [face.id, faceProperties(face)]),
  );
  // Only tolerances that name faces can define a frame. An empty key would match a
  // callout that names none, and call it basic.
  const toleranceFaceKeys = new Set(
    shaped.geometric_tolerances
      .map((tolerance) => tolerance.entity_ids ?? [])
      .filter((entityIds) => entityIds.length > 0)
      .map((entityIds) => faceSetKey(entityIds)),
  );
  return evaluateDimensions(shaped.dimensions, properties, toleranceFaceKeys);
}

export async function handler(args: z.output<typeof schema>) {
  const include = args.include ? new Set(args.include) : DEFAULT_INCLUDE;
  return sidecarModels.withModel(
    artifactPath(args.uri),
    async (client, modelId, filePath, revision, units) => {
      const result = await memoiseByRevision(
        filePath,
        revision,
        'pmi',
        async () => (await client.request('pmi', { modelId })).result,
      );
      const shaped = shapePmi(result, units.mmPerUnit);
      const machineReadable =
        result.counts.dimensions +
        result.counts.geometricTolerances +
        result.counts.datumReferences;
      const pmi_kind = pmiKind(machineReadable, result.counts.presentationSkipped);
      const full: DescribePmiResult = {
        artifact: artifactReference(filePath, revision, units.name),
        coordinate_frame: stepModelFrame(units.name),
        unit_note: unitNote(units),
        units: { length: units.name },
        pmi_kind,
        counts: {
          dimensions: result.counts.dimensions,
          geometric_tolerances: result.counts.geometricTolerances,
          datum_references: result.counts.datumReferences,
          unique_datums: result.counts.uniqueDatums,
          presentation_skipped: result.counts.presentationSkipped,
        },
        warnings: [
          ...result.warnings,
          // The distinction an empty section must never lose: a file whose requirements are
          // drawn but not encodable is not a file without requirements.
          ...(pmi_kind === 'graphical-only'
            ? [
                `${String(result.counts.presentationSkipped)} callout(s) exist only as graphical presentation and none are machine-readable. The requirements are visible but cannot be read from this file; they have to come from the drawing, the specification, or the engineer.`,
              ]
            : []),
        ],
      };
      if (include.has('dimensions')) {
        full.dimensions = shaped.dimensions;
        full.characteristics = await evaluate(shaped, client, modelId);
      }
      if (include.has('tolerances')) full.geometric_tolerances = shaped.geometric_tolerances;
      if (include.has('datums')) full.datums = shaped.datums;
      return full as unknown as Record<string, unknown>;
    },
  );
}
