import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Hash the exact bytes of a file without buffering the complete file in memory. */
export async function fileRevision(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}
