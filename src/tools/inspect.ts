import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import type { Vec3 } from '../sidecar/operations.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
  stepModelFrame,
} from '../domain/artifact-reference.js';

const includeSchema = z
  .array(z.enum(['size', 'counts', 'health']))
  .optional()
  .meta({
    description:
      'Sections to include: size, counts, health. Default: all three. Example: ["size", "health"].',
  });

const baseSchema = z
  .object({
    ...artifactLocatorSchema.shape,
    include: includeSchema.meta({
      description:
        'Sections to return. Omit for all three; ask for fewer to save context on a large assembly.',
    }),
  })
  .strict();

export const schema = z.preprocess(stripNulls, baseSchema);

export const examples = [
  { uri: 'file:///work/model.step' },
  { uri: 'file:///work/model.step', include: ['size', 'health'] },
];

const DEFAULT_INCLUDE = new Set(['size', 'counts', 'health']);

/**
 * The inspect payload. Sections are present only when requested through
 * `include`; `artifact` and `coordinate_frame` are always returned.
 */
export type InspectResult = {
  artifact: ReturnType<typeof artifactReference>;
  coordinate_frame: ReturnType<typeof stepModelFrame>;
  size?: {
    bounding_box: { min: Vec3; max: Vec3 };
    dimensions: { width: number; height: number; depth: number };
    volume: number;
    surface_area: number;
    units: { length: string; area: string; volume: string };
  };
  structure?: {
    body_count: number;
    is_assembly: boolean;
    component_occurrences: string[];
  };
  health?: {
    is_valid: boolean;
    complexity: { body_count: number; face_count: number; edge_count: number };
  };
};

export async function handler(args: z.output<typeof schema>) {
  const include = args.include ? new Set(args.include) : DEFAULT_INCLUDE;
  return sidecarModels.withModel(
    artifactPath(args.uri),
    async (client, modelId, _filePath, revision, units) => {
      const { result } = await client.request('inspect', { modelId });
      const { min, max } = result.bounds;
      const [minX, minY, minZ] = min;
      const [maxX, maxY, maxZ] = max;
      const full: InspectResult = {
        artifact: artifactReference(_filePath, revision, units.name),
        coordinate_frame: stepModelFrame(units.name),
        size: {
          bounding_box: { min, max },
          dimensions: { width: maxX - minX, height: maxY - minY, depth: maxZ - minZ },
          volume: result.volume,
          surface_area: result.surfaceArea,
          units: { length: units.name, area: `${units.name}2`, volume: `${units.name}3` },
        },
        structure: {
          body_count: result.solids,
          is_assembly: (result.xcaf?.rootAssemblies ?? 0) > 0,
          component_occurrences: result.xcaf?.occurrenceIds ?? [],
        },
        health: {
          is_valid: result.valid,
          complexity: {
            body_count: result.solids,
            face_count: result.faces,
            edge_count: result.edges,
          },
        },
      };
      return filterInspectResult(full, include);
    },
  );
}

export function filterInspectResult(full: InspectResult, include: Set<string>): InspectResult {
  const result: InspectResult = {
    artifact: full.artifact,
    coordinate_frame: full.coordinate_frame,
  };

  if (include.has('size')) result.size = full.size;
  if (include.has('counts') || include.has('health')) {
    result.structure = full.structure;
  }
  if (include.has('health')) {
    result.health = full.health;
  }
  return result;
}
