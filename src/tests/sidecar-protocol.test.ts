import { describe, expect, it } from 'vitest';
import {
  encodeBinaryFrame,
  encodeJsonFrame,
  parseJsonFrame,
  SidecarFrameDecoder,
  type SidecarFrame,
} from '../sidecar/protocol.js';

describe('sidecar binary framing', () => {
  it('decodes correlated JSON and binary frames across arbitrary pipe chunks', () => {
    const json = encodeJsonFrame(7, { ok: true, result: { value: 42 } });
    const mesh = Buffer.from(Array.from({ length: 257 }, (_, i) => i % 256));
    const binary = encodeBinaryFrame(8, mesh);
    const stream = Buffer.concat([json, binary]);
    const decoder = new SidecarFrameDecoder();
    const frames: SidecarFrame[] = [];

    for (let offset = 0; offset < stream.length;) {
      const size = Math.min((offset % 13) + 1, stream.length - offset);
      frames.push(...decoder.push(stream.subarray(offset, offset + size)));
      offset += size;
    }
    decoder.finish();

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ kind: 'json', requestId: 7 });
    expect(parseJsonFrame(frames[0]!)).toEqual({ ok: true, result: { value: 42 } });
    expect(frames[1]).toMatchObject({ kind: 'binary', requestId: 8, payload: mesh });
  });

  it('supports a zero-length binary response', () => {
    const decoder = new SidecarFrameDecoder();
    const [frame] = decoder.push(encodeBinaryFrame(1, new Uint8Array()));
    decoder.finish();
    expect(frame).toMatchObject({ kind: 'binary', requestId: 1, payload: Buffer.alloc(0) });
  });

  it('rejects malformed headers and oversized frames before reading payloads', () => {
    const invalidMagic = encodeJsonFrame(1, {});
    invalidMagic[0] = 0;
    expect(() => new SidecarFrameDecoder().push(invalidMagic)).toThrow(
      'Invalid sidecar frame magic',
    );

    const invalidKind = encodeJsonFrame(1, {});
    invalidKind[4] = 3;
    expect(() => new SidecarFrameDecoder().push(invalidKind)).toThrow(
      'Unsupported sidecar frame kind',
    );

    const oversized = Buffer.alloc(16);
    oversized.write('OCS1', 0, 'ascii');
    oversized[4] = 1;
    oversized.writeUInt32LE(1, 8);
    oversized.writeUInt32LE(16 * 1024 * 1024 + 1, 12);
    expect(() => new SidecarFrameDecoder().push(oversized)).toThrow('exceeds');
  });

  it('rejects invalid request ids and truncated streams', () => {
    expect(() => encodeJsonFrame(0, {})).toThrow('request id');

    const shortHeader = new SidecarFrameDecoder();
    shortHeader.push(Buffer.from('OCS'));
    expect(() => shortHeader.finish()).toThrow('Truncated');

    const shortPayload = new SidecarFrameDecoder();
    shortPayload.push(encodeJsonFrame(3, { result: 'long enough' }).subarray(0, 18));
    expect(() => shortPayload.finish()).toThrow('Truncated');
  });
});
