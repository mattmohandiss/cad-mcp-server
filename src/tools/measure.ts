import { z } from 'zod';
import { stripNulls } from '../tool-schemas.js';
import { sidecarModels } from '../sidecar/models.js';
import { directionModeSchema, entityId, point3, shapeEntityId } from '../tool-schemas.js';
import {
  artifactPath,
  artifactReference,
  artifactReferenceInputSchema,
  ENTITY_ID_SCHEME,
  stepModelFrame,
  subjectReference,
} from '../domain/artifact-reference.js';
import { parseEntityId } from '../utils/ids.js';

export const MEASURE_KINDS = [
  'distance',
  'thickness',
  'draft',
  'ray',
  'ray_grid',
  'point_analysis',
  'section',
  'continuity',
] as const;

export type MeasureKind = (typeof MEASURE_KINDS)[number];

type MeasureField =
  | 'sources'
  | 'targets'
  | 'entity_ids'
  | 'direction'
  | 'direction_mode'
  | 'pull_direction'
  | 'pull_direction_mode'
  | 'origin'
  | 'origin_mode'
  | 'points'
  | 'checks'
  | 'plane_origin'
  | 'plane_normal';

/** Entity kinds an `entity_ids` entry may name, per kind. */
type EntityKind = 'face' | 'edge' | 'vertex' | 'body';

/**
 * The argument contract lives here once. `FIELD_HELP` is published as the
 * advertised schema descriptions, and `MEASURE_KIND_SPECS` drives both input
 * validation and the per-kind requirements in `cad://help`, so a caller can
 * learn the shape from the schema instead of from a failed call.
 */
const FIELD_HELP = {
  artifact:
    'Revision-bound STEP reference from inspect: { uri, revision, format, units }. Rejected if the file changed since inspect.',
  kind: 'Measurement to perform. Each kind takes a different argument set; see the field notes here and the per-kind requirements in cad://help.',
  sources:
    'distance only: entities to measure from (face:N, edge:N, body:N, or a component-scoped form).',
  targets: 'distance only: entities to measure to.',
  summary:
    'distance only: "all" returns every pair, "minimum" (default) returns the closest pair only.',
  entity_ids:
    'Every kind except distance: the entities to measure. Faces for thickness, draft, ray and ray_grid; edges for continuity; faces or bodies for section and point_analysis. Up to 100 IDs.',
  direction:
    'ray and ray_grid: ray direction as an explicit [x, y, z] vector. Mutually exclusive with direction_mode.',
  direction_mode:
    'ray and ray_grid: "axis" shoots along the entity axis, "normal" along the entity normal (faces only). Mutually exclusive with direction.',
  pull_direction:
    'draft only: mould pull direction as an explicit [x, y, z] vector. Mutually exclusive with pull_direction_mode.',
  pull_direction_mode:
    'draft only: "axis" or "normal" shortcut for the pull direction (faces only). Mutually exclusive with pull_direction.',
  bidirectional: 'ray and ray_grid: also shoot from the origin in the opposite direction.',
  spacing: 'ray_grid: grid pitch in model units (mm), at most 1000.',
  max_distance: 'ray, ray_grid and thickness: ignore hits beyond this distance in model units.',
  origin: 'ray and ray_grid: explicit ray origin [x, y, z]. Mutually exclusive with origin_mode.',
  origin_mode:
    'ray and ray_grid: place the origin at the entity extent instead of passing origin: extent_min, extent_center (default), or extent_max.',
  points: 'point_analysis: points to test, in model coordinates (mm), up to 100.',
  checks:
    'point_analysis: one or more of contains_body, classify_face, closest_face_point, surface_curvature, edge_projection.',
  tolerance: 'continuity and point checks: geometric tolerance in model units.',
  plane_origin: 'section: a point on the cutting plane.',
  plane_normal: 'section: cutting-plane normal.',
  detail: 'Per-sample detail to return: "stats" (default), "samples", or "hits".',
} as const;

interface KindSpec {
  /** Fields this kind cannot work without. */
  requires: readonly MeasureField[];
  /** Field groups where at least one member must be present. */
  oneOf?: readonly (readonly MeasureField[])[];
  /** `entity_ids` kinds this kind accepts; undefined means any. */
  entityKinds?: readonly EntityKind[];
  /** One-line description of what the kind measures. */
  note: string;
}

export const MEASURE_KIND_SPECS: Record<MeasureKind, KindSpec> = {
  distance: {
    requires: ['sources', 'targets'],
    note: 'Minimum distance between two entity sets; at most 100,000 pairs.',
  },
  thickness: {
    requires: ['entity_ids'],
    entityKinds: ['face'],
    note: 'Material thickness sampled on the given faces, along the face normal unless a pull direction is given.',
  },
  draft: {
    requires: ['entity_ids'],
    oneOf: [['pull_direction', 'pull_direction_mode']],
    entityKinds: ['face'],
    note: 'Draft angle of the given faces against a pull direction.',
  },
  ray: {
    requires: ['entity_ids'],
    oneOf: [['direction', 'direction_mode']],
    note: 'Cast rays from the given entities and report the hits.',
  },
  ray_grid: {
    requires: ['entity_ids'],
    oneOf: [['direction', 'direction_mode']],
    entityKinds: ['face'],
    note: 'Spaced grid of rays over a face.',
  },
  point_analysis: {
    requires: ['entity_ids', 'points', 'checks'],
    note: 'Evaluate points against the model. At most 5,000 entity-point-check combinations.',
  },
  section: {
    requires: ['entity_ids', 'plane_origin', 'plane_normal'],
    note: 'Cut the given entities with a plane and return the section edges.',
  },
  continuity: {
    requires: ['entity_ids'],
    entityKinds: ['edge'],
    note: 'G0/G1/G2 continuity of the given edges.',
  },
};

/** Fields only `distance` accepts. */
const DISTANCE_ONLY: readonly MeasureField[] = ['sources', 'targets'];

const baseSchema = z
  .object({
    artifact: artifactReferenceInputSchema.meta({ description: FIELD_HELP.artifact }),
    kind: z.enum(MEASURE_KINDS).meta({ description: FIELD_HELP.kind }),
    sources: z
      .array(shapeEntityId)
      .min(1)
      .max(1000)
      .optional()
      .meta({ description: FIELD_HELP.sources }),
    targets: z
      .array(shapeEntityId)
      .min(1)
      .max(1000)
      .optional()
      .meta({ description: FIELD_HELP.targets }),
    summary: z
      .enum(['all', 'minimum'])
      .default('minimum')
      .meta({ description: FIELD_HELP.summary }),
    entity_ids: z
      .array(entityId)
      .min(1)
      .max(100)
      .optional()
      .meta({ description: FIELD_HELP.entity_ids }),
    direction: point3.optional().meta({ description: FIELD_HELP.direction }),
    direction_mode: directionModeSchema.optional().meta({
      description: FIELD_HELP.direction_mode,
    }),
    pull_direction: point3.optional().meta({
      description: FIELD_HELP.pull_direction,
    }),
    pull_direction_mode: directionModeSchema.optional().meta({
      description: FIELD_HELP.pull_direction_mode,
    }),
    bidirectional: z.boolean().optional().meta({
      description: FIELD_HELP.bidirectional,
    }),
    spacing: z.coerce
      .number()
      .positive()
      .max(1000)
      .optional()
      .meta({ description: FIELD_HELP.spacing }),
    max_distance: z.coerce
      .number()
      .positive()
      .max(1_000_000)
      .optional()
      .meta({ description: FIELD_HELP.max_distance }),
    origin: point3.optional().meta({ description: FIELD_HELP.origin }),
    origin_mode: z
      .enum(['extent_min', 'extent_center', 'extent_max'])
      .optional()
      .meta({ description: FIELD_HELP.origin_mode }),
    points: z.array(point3).min(1).max(100).optional().meta({ description: FIELD_HELP.points }),
    checks: z
      .array(
        z.enum([
          'contains_body',
          'classify_face',
          'closest_face_point',
          'surface_curvature',
          'edge_projection',
        ]),
      )
      .min(1)
      .max(5)
      .optional()
      .meta({ description: FIELD_HELP.checks }),
    tolerance: z.coerce
      .number()
      .nonnegative()
      .max(1000)
      .optional()
      .meta({ description: FIELD_HELP.tolerance }),
    plane_origin: point3.optional().meta({ description: FIELD_HELP.plane_origin }),
    plane_normal: point3.optional().meta({ description: FIELD_HELP.plane_normal }),
    detail: z
      .enum(['stats', 'samples', 'hits'])
      .optional()
      .meta({ description: FIELD_HELP.detail }),
  })
  .strict()
  .superRefine((value, ctx) => {
    const spec = MEASURE_KIND_SPECS[value.kind];
    const reject = (field: MeasureField, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });

    for (const [a, b, field] of [
      ['direction', 'direction_mode', 'direction_mode'],
      ['origin', 'origin_mode', 'origin_mode'],
      ['pull_direction', 'pull_direction_mode', 'pull_direction_mode'],
    ] as const) {
      if (value[a] !== undefined && value[b] !== undefined)
        reject(field, `Choose ${a} or ${b}, not both.`);
    }

    if (value.kind !== 'distance') {
      for (const field of DISTANCE_ONLY) {
        if (value[field] !== undefined) reject(field, `${value.kind} does not accept ${field}.`);
      }
    }

    for (const field of spec.requires) {
      if (value[field] === undefined)
        reject(field, `${value.kind} requires ${field}. ${spec.note}`);
    }

    for (const group of spec.oneOf ?? []) {
      const first = group[0];
      if (first && group.every((field) => value[field] === undefined))
        reject(first, `${value.kind} requires one of ${group.join(' or ')}.`);
    }

    const ids = (value.entity_ids ?? []).map((id) => parseEntityId(id)?.type);
    if (spec.entityKinds && ids.some((kind) => !spec.entityKinds?.includes(kind as EntityKind)))
      reject('entity_ids', `${value.kind} accepts ${spec.entityKinds.join('/')} IDs only.`);
    if (
      (value.direction_mode !== undefined || value.pull_direction_mode !== undefined) &&
      ids.some((kind) => kind !== 'face')
    )
      reject('direction_mode', 'Direction shortcuts currently require face IDs.');

    if (
      value.kind === 'distance' &&
      value.sources &&
      value.targets &&
      value.sources.length * value.targets.length > 100_000
    )
      reject('targets', 'At most 100,000 entity pairs are allowed.');

    if (
      value.kind === 'point_analysis' &&
      value.entity_ids &&
      value.points &&
      value.checks &&
      value.entity_ids.length * value.points.length * value.checks.length > 5000
    )
      reject(
        'points',
        'Point-analysis requests are limited to 5,000 entity-point-check combinations.',
      );
  });

const exampleArtifact = {
  revision: `sha256:${'0'.repeat(64)}`,
  uri: 'file:///work/model.step',
  format: 'step' as const,
  units: 'mm' as const,
};

export const schema = z.preprocess(stripNulls, baseSchema);

export const examples = [
  {
    artifact: exampleArtifact,
    kind: 'distance',
    sources: ['face:2'],
    targets: ['face:5'],
    summary: 'minimum',
  },
  {
    artifact: exampleArtifact,
    kind: 'thickness',
    entity_ids: ['face:6'],
    direction_mode: 'normal',
  },
  { artifact: exampleArtifact, kind: 'draft', entity_ids: ['face:1'], pull_direction: [0, 0, 1] },
  {
    artifact: exampleArtifact,
    kind: 'ray_grid',
    entity_ids: ['face:6'],
    direction_mode: 'normal',
    spacing: 2,
  },
  {
    artifact: exampleArtifact,
    kind: 'section',
    entity_ids: ['body:0'],
    plane_origin: [0, 0, 0],
    plane_normal: [1, 0, 0],
  },
];

export async function handler(args: z.output<typeof schema>) {
  return sidecarModels.withModel(
    artifactPath(args.artifact.uri),
    async (client, modelId, filePath, revision, units) => {
      if (args.kind === 'distance') {
        const { result } = await client.request('measureEntityDistances', {
          modelId,
          sources: args.sources,
          targets: args.targets,
          summary: args.summary,
        });
        return {
          artifact: artifactReference(filePath, revision, units.name),
          entity_id_scheme: ENTITY_ID_SCHEME,
          coordinate_frame: stepModelFrame(units.name),
          subjects: [...(args.sources ?? []), ...(args.targets ?? [])].map((id) =>
            subjectReference(id),
          ),
          kind: args.kind,
          units: { length: units.name },
          pair_count: result.pair_count,
          min_distance: result.minimum?.distance,
          closest_source: result.minimum?.source_entity_id,
          closest_target: result.minimum?.target_entity_id,
          pairs: result.pairs,
        };
      }
      const { result } = await client.request('measureGeometry', {
        modelId,
        kind: args.kind,
        entityIds: args.entity_ids,
        direction: args.kind === 'draft' ? args.pull_direction : args.direction,
        directionMode:
          args.kind === 'draft'
            ? args.pull_direction_mode
            : args.kind === 'thickness' && args.direction_mode === 'normal'
              ? 'inward_normal'
              : args.direction_mode,
        origin: args.origin,
        originMode: args.origin_mode,
        bidirectional: args.bidirectional,
        spacingMm: args.spacing,
        maxDistance: args.max_distance,
        points: args.points,
        checks: args.checks,
        tolerance: args.tolerance,
        planeOrigin: args.plane_origin,
        planeNormal: args.plane_normal,
        detail: args.detail,
      });
      return {
        artifact: artifactReference(filePath, revision, units.name),
        entity_id_scheme: ENTITY_ID_SCHEME,
        coordinate_frame: stepModelFrame(units.name),
        subjects: (args.entity_ids ?? []).map((id) => subjectReference(id)),
        kind: args.kind,
        units: { length: units.name, angle: 'deg', curvature: `${units.name}-1` },
        entity_count: args.entity_ids?.length ?? 0,
        results: result.results,
      };
    },
    args.artifact.revision,
  );
}
