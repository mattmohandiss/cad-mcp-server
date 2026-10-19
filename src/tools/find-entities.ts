import { z } from 'zod';
import { sidecarModels } from '../sidecar/models.js';
import {
  artifactPath,
  artifactReferenceSchema,
  artifactReference,
  ENTITY_ID_SCHEME,
  STEP_MODEL_FRAME,
} from '../domain/artifact-reference.js';
import { CURVE_TYPES, SURFACE_TYPES } from '../tool-defs.js';
import { parseEntityId } from '../utils/ids.js';

const page = {
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
};

const ENTITY_TYPES = ['face', 'edge', 'vertex', 'body'] as const;
const FILTER_FIELDS = [
  'surface_type',
  'min_area',
  'max_area',
  'curve_type',
  'min_length',
  'max_length',
  'min_radius',
  'max_radius',
] as const;

const componentName = z.string().min(1).max(256).optional().meta({
  description:
    'Optional component scope from inspect.structure.component_occurrences; use the base name for all repeated instances or the full name#instance ID for one occurrence.',
});

// A single flat object schema, not a top-level union. Tool-calling models handle
// a root `properties` object reliably; a root `oneOf` caused the artifact
// reference to be serialized as a string, which the server then rejected. The
// per-entity-type field rules are enforced in the refinement below.
export const schema = z
  .object({
    artifact: artifactReferenceSchema,
    entity_type: z.enum(ENTITY_TYPES).meta({
      description: 'Entity category to search.',
    }),
    component_name: componentName,
    entity_ids: z.array(z.string()).min(1).max(1000).optional().meta({
      description:
        'Optional explicit ids to return; each must match entity_type (e.g. ["face:3"]).',
    }),
    surface_type: z.enum(SURFACE_TYPES).optional(),
    min_area: z.number().nonnegative().optional(),
    max_area: z.number().nonnegative().optional(),
    curve_type: z.enum(CURVE_TYPES).optional(),
    min_length: z.number().nonnegative().optional(),
    max_length: z.number().nonnegative().optional(),
    min_radius: z.number().nonnegative().optional(),
    max_radius: z.number().nonnegative().optional(),
    ...page,
  })
  .strict()
  .superRefine((args, ctx) => {
    const reject = (field: (typeof FILTER_FIELDS)[number], owner: string) => {
      if (args[field] !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} applies to ${owner}, not ${args.entity_type}.`,
        });
    };
    if (args.entity_type === 'face') {
      reject('curve_type', 'edges');
      reject('min_length', 'edges');
      reject('max_length', 'edges');
    } else if (args.entity_type === 'edge') {
      reject('surface_type', 'faces');
      reject('min_area', 'faces');
      reject('max_area', 'faces');
    } else {
      for (const field of FILTER_FIELDS) reject(field, 'faces or edges');
    }
    for (const [index, id] of (args.entity_ids ?? []).entries()) {
      if (parseEntityId(id)?.type !== args.entity_type)
        ctx.addIssue({
          code: 'custom',
          path: ['entity_ids', index],
          message: `entity_ids[${index}] must be a ${args.entity_type} id.`,
        });
    }
    if (args.min_area !== undefined && args.max_area !== undefined && args.min_area > args.max_area)
      ctx.addIssue({
        code: 'custom',
        path: ['max_area'],
        message: 'max_area must be >= min_area.',
      });
    if (
      args.min_length !== undefined &&
      args.max_length !== undefined &&
      args.min_length > args.max_length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['max_length'],
        message: 'max_length must be >= min_length.',
      });
    if (
      args.min_radius !== undefined &&
      args.max_radius !== undefined &&
      args.min_radius > args.max_radius
    )
      ctx.addIssue({
        code: 'custom',
        path: ['max_radius'],
        message: 'max_radius must be >= min_radius.',
      });
  });

const exampleArtifact = {
  revision: `sha256:${'0'.repeat(64)}`,
  uri: 'file:///work/model.step',
  format: 'step' as const,
  units: 'mm' as const,
};

export const examples = [
  { artifact: exampleArtifact, entity_type: 'face', surface_type: 'cylinder', min_area: 100 },
  { artifact: exampleArtifact, entity_type: 'edge', curve_type: 'circle', min_length: 20 },
  { artifact: exampleArtifact, entity_type: 'vertex', limit: 20 },
  { artifact: exampleArtifact, entity_type: 'body' },
];

export async function handler(args: z.output<typeof schema>) {
  return sidecarModels.withModel(
    artifactPath(args.artifact.uri),
    async (client, modelId, filePath, revision) => {
      const filters =
        args.entity_type === 'face'
          ? {
              surface_type: args.surface_type,
              min_area: args.min_area,
              max_area: args.max_area,
              min_radius: args.min_radius,
              max_radius: args.max_radius,
            }
          : args.entity_type === 'edge'
            ? {
                curve_type: args.curve_type,
                min_length: args.min_length,
                max_length: args.max_length,
                min_radius: args.min_radius,
                max_radius: args.max_radius,
              }
            : {};
      const { result } = await client.request('findEntities', {
        modelId,
        entityType: args.entity_type,
        componentName: args.component_name,
        entityIds: args.entity_ids,
        filters,
        limit: args.limit,
        offset: args.offset,
      });
      const { artifact: _artifact, entity_type, entity_ids, limit, offset, ...where } = args;
      const compactFilters = Object.fromEntries(
        Object.entries(where).filter(
          ([key, value]) => !['limit', 'offset'].includes(key) && value !== undefined,
        ),
      );
      return {
        artifact: artifactReference(filePath, revision),
        entity_id_scheme: ENTITY_ID_SCHEME,
        units: { length: 'mm', area: 'mm2', volume: 'mm3', angle: 'deg' },
        coordinate_frame: STEP_MODEL_FRAME,
        query: { entity_type, filters: compactFilters, ...(entity_ids ? { entity_ids } : {}) },
        statistics: { total_entities: result.total_matched },
        pagination: {
          limit,
          offset,
          returned: result.entities.length,
          total_matched: result.total_matched,
          has_more: offset + result.entities.length < result.total_matched,
        },
        entities: result.entities,
        groups: [],
      };
    },
    args.artifact.revision,
  );
}
