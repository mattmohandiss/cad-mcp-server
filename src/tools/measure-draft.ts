import { z } from 'zod';
import type { MeasureSpec } from '../query/measure.js';
import { runTool } from '../tool-helper.js';
import {
  filePath,
  faceEntityId,
  entityIdArray,
  point3,
  directionModeSchema,
  exclusiveFields,
} from '../tool-schemas.js';
import { batchMeasure, mapDirectionMode } from './measure-helpers.js';

export const schema = z
  .object({
    file_path: filePath,
    faces: entityIdArray(faceEntityId, 'Face IDs to check draft angle on.'),
    pull_direction: point3.optional().meta({
      description: 'Pull direction [x,y,z]. Mutually exclusive with pull_direction_mode.',
    }),
    pull_direction_mode: directionModeSchema.optional(),
  })
  .strict()
  .superRefine(exclusiveFields('pull_direction', 'pull_direction_mode'));

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    faces: ['face:1', 'face:2', 'face:3'],
    pull_direction: [0, 0, 1],
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    const specs = buildMeasureSpecs(args);
    const results = await batchMeasure(args.file_path, args.faces, specs);
    return {
      file_path: args.file_path,
      faces: args.faces,
      face_count: args.faces.length,
      results,
    };
  });
}

export function buildMeasureSpecs(args: Args): MeasureSpec[] {
  return [
    {
      op: 'draft_angle',
      direction_shortcut: mapDirectionMode(args.pull_direction_mode),
      direction: args.pull_direction,
    },
  ];
}
