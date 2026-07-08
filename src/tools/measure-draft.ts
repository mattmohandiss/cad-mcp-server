import { z } from 'zod';
import type { MeasureSpec } from '../query/measure.js';
import { runTool } from '../tool-helper.js';
import { filePath, entityId } from '../tool-schemas.js';
import { batchMeasure, mapDirectionMode } from './measure-helpers.js';

const faceSchema = entityId.refine(
  (id) => id.startsWith('face:'),
  'Must be a face:N ID from a prior find_faces or inspect_step result.',
);

const point3 = z.array(z.number()).length(3);

export const schema = z
  .object({
    file_path: filePath,
    faces: z
      .array(faceSchema)
      .min(1)
      .max(500)
      .meta({ description: 'Face IDs to check draft angle on.' }),
    pull_direction: point3.optional().meta({
      description: 'Pull direction [x,y,z]. Mutually exclusive with pull_direction_mode.',
    }),
    pull_direction_mode: z.enum(['axis', 'normal']).optional().meta({
      description:
        'Direction shortcut. axis = along the face axis; normal = along the face normal.',
    }),
  })
  .strict();

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
    const mode = mapDirectionMode(args.pull_direction_mode);
    const specs: MeasureSpec[] = [
      {
        op: 'draft_angle',
        direction_shortcut: mode,
        direction: args.pull_direction,
      },
    ];
    const results = await batchMeasure(args.file_path, args.faces, specs);
    return {
      file_path: args.file_path,
      faces: args.faces,
      face_count: args.faces.length,
      results,
    };
  });
}
