import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
  stepModelFrame,
} from '../domain/artifact-reference.js';
import type { SidecarPmi } from '../sidecar/operations.js';

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

/** A dimensional callout, in the unit `units.length` reports. */
export type PmiDimension = {
  kind: string;
  nominal: number;
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
  datums?: Array<{ name: string; position: number }>;
  entity_ids?: string[];
  secondary_entity_ids?: string[];
};

export type PmiDatum = {
  name: string;
  position: number;
  is_target: boolean;
  target_type?: string;
};

export type DescribePmiResult = {
  artifact: ReturnType<typeof artifactReference>;
  coordinate_frame: ReturnType<typeof stepModelFrame>;
  units: { length: string };
  counts: {
    dimensions: number;
    geometric_tolerances: number;
    datums: number;
    presentation_skipped: number;
  };
  dimensions?: PmiDimension[];
  geometric_tolerances?: PmiTolerance[];
  datums?: PmiDatum[];
  warnings: string[];
};

/**
 * The sidecar reports GD&T in millimetres whatever unit the geometry was read
 * in, so every value is divided by the model's millimetres-per-unit. Returning
 * them raw would be wrong by 25.4x on an inch part, and would not compare with
 * any measurement from the same artifact.
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
      };
      if (dimension.upperDeviation !== undefined) {
        entry.upper_deviation = scale(dimension.upperDeviation);
      }
      if (dimension.lowerDeviation !== undefined) {
        entry.lower_deviation = scale(dimension.lowerDeviation);
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
      if (tolerance.datums) entry.datums = tolerance.datums;
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
      return entry;
    }),
  };
}

export async function handler(args: z.output<typeof schema>) {
  const include = args.include ? new Set(args.include) : DEFAULT_INCLUDE;
  return sidecarModels.withModel(
    artifactPath(args.uri),
    async (client, modelId, filePath, revision, units) => {
      const { result } = await client.request('pmi', { modelId });
      const shaped = shapePmi(result, units.mmPerUnit);
      const full: DescribePmiResult = {
        artifact: artifactReference(filePath, revision, units.name),
        coordinate_frame: stepModelFrame(units.name),
        units: { length: units.name },
        counts: {
          dimensions: result.counts.dimensions,
          geometric_tolerances: result.counts.geometricTolerances,
          datums: result.counts.datums,
          presentation_skipped: result.counts.presentationSkipped,
        },
        warnings: result.warnings,
      };
      if (include.has('dimensions')) full.dimensions = shaped.dimensions;
      if (include.has('tolerances')) full.geometric_tolerances = shaped.geometric_tolerances;
      if (include.has('datums')) full.datums = shaped.datums;
      return full as unknown as Record<string, unknown>;
    },
  );
}
