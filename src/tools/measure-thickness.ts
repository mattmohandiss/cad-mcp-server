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
      .meta({ description: 'Face IDs to measure wall thickness across.' }),
    direction: point3
      .optional()
      .meta({ description: 'Ray direction [x,y,z]. Mutually exclusive with direction_mode.' }),
    direction_mode: z.enum(['axis', 'normal']).optional().meta({
      description:
        'Direction shortcut. axis = along the face axis; normal = along the face normal.',
    }),
    bidirectional: z
      .boolean()
      .default(true)
      .optional()
      .meta({ description: 'Fire rays in both directions. Default true for thickness.' }),
    spacing_mm: z
      .number()
      .positive()
      .default(2)
      .optional()
      .meta({ description: 'Grid spacing in mm. Smaller = denser sampling.' }),
    detail: z
      .enum(['stats', 'samples'])
      .default('stats')
      .optional()
      .meta({ description: 'stats = min/max/avg only; samples = include hit coordinates.' }),
  })
  .strict();

type Args = z.output<typeof schema>;

export const examples = [
  {
    file_path: 'model.step',
    faces: ['face:6', 'face:7', 'face:8'],
    direction_mode: 'normal',
    bidirectional: true,
    spacing_mm: 2,
  },
];

export async function handler(args: Args) {
  return runTool(async () => {
    const mode = mapDirectionMode(args.direction_mode);
    const specs: MeasureSpec[] = [
      {
        op: 'ray_test_grid',
        direction_shortcut: mode,
        direction: args.direction,
        bidirectional: args.bidirectional !== false,
        spacing_mm: args.spacing_mm,
        detail_level: args.detail === 'samples' ? 'points' : 'aggregate',
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
