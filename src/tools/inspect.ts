import { z } from 'zod';
import { runTool } from '../tool-helper.js';
import { sidecarModels } from '../sidecar/models.js';
import {
  artifactLocatorSchema,
  artifactPath,
  artifactReference,
  STEP_MODEL_FRAME,
} from '../domain/artifact-reference.js';

const includeSchema = z
  .array(z.enum(['size', 'counts', 'health']))
  .optional()
  .meta({
    description:
      'Sections to include: size, counts, health. Default: all three. Example: ["size", "health"].',
  });

export const schema = z
  .object({
    ...artifactLocatorSchema.shape,
    include: includeSchema,
  })
  .strict();

export const examples = [
  { uri: 'file:///work/model.step' },
  { uri: 'file:///work/model.step', include: ['size', 'health'] },
];

const DEFAULT_INCLUDE = new Set(['size', 'counts', 'health']);

export async function handler(args: z.output<typeof schema>) {
  return runTool(async () => {
    const include = args.include ? new Set(args.include) : DEFAULT_INCLUDE;
    return sidecarModels.withModel(
      artifactPath(args.uri),
      async (client, modelId, _filePath, revision) => {
        const { result } = await client.request<{
          solids: number;
          faces: number;
          edges: number;
          vertices: number;
          volume: number;
          surfaceArea: number;
          valid: boolean;
          bounds: { min: number[]; max: number[] };
          xcaf?: {
            roots: number;
            rootAssemblies: number;
            components: number;
            occurrenceIds: string[];
          };
        }>('inspect', { modelId });
        const dimensions = result.bounds.min.map((min, axis) => result.bounds.max[axis]! - min);
        const full: Record<string, unknown> = {
          artifact: artifactReference(_filePath, revision),
          coordinate_frame: STEP_MODEL_FRAME,
          size: {
            bounding_box: { min: result.bounds.min, max: result.bounds.max },
            dimensions: { width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
            volume: result.volume,
            surface_area: result.surfaceArea,
            units: { length: 'mm', area: 'mm2', volume: 'mm3' },
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
  });
}

export function filterInspectResult(
  full: Record<string, unknown>,
  include: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
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
