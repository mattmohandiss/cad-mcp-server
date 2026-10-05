import { Buffer } from 'node:buffer';

const MAGIC = Buffer.from('OCS1');
const HEADER_BYTES = 16;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_BINARY_BYTES = 64 * 1024 * 1024;

export type SidecarFrame =
  | { kind: 'json'; requestId: number; payload: Buffer }
  | { kind: 'binary'; requestId: number; payload: Buffer };

type FrameKind = SidecarFrame['kind'];

function maxPayload(kind: FrameKind): number {
  return kind === 'json' ? MAX_JSON_BYTES : MAX_BINARY_BYTES;
}

function kindByte(kind: FrameKind): number {
  return kind === 'json' ? 1 : 2;
}

function parseHeader(header: Buffer): { kind: FrameKind; requestId: number; length: number } {
  if (!header.subarray(0, 4).equals(MAGIC)) throw new Error('Invalid sidecar frame magic');
  if (header[5] !== 0 || header[6] !== 0 || header[7] !== 0) {
    throw new Error('Unsupported sidecar frame flags');
  }

  const kindByteValue = header[4];
  const kind = kindByteValue === 1 ? 'json' : kindByteValue === 2 ? 'binary' : undefined;
  if (!kind) throw new Error(`Unsupported sidecar frame kind: ${kindByteValue}`);

  const requestId = header.readUInt32LE(8);
  if (requestId === 0) throw new Error('Sidecar frame request id must be positive');

  const length = header.readUInt32LE(12);
  if (length > maxPayload(kind)) {
    throw new Error(`Sidecar ${kind} frame exceeds ${maxPayload(kind)} byte limit`);
  }
  return { kind, requestId, length };
}

function encodeFrame(kind: FrameKind, requestId: number, payload: Uint8Array): Buffer {
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 0xffff_ffff) {
    throw new RangeError('Sidecar request id must be an unsigned 32-bit integer greater than zero');
  }
  if (payload.byteLength > maxPayload(kind)) {
    throw new RangeError(`Sidecar ${kind} frame exceeds ${maxPayload(kind)} byte limit`);
  }

  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header[4] = kindByte(kind);
  header.writeUInt32LE(requestId, 8);
  header.writeUInt32LE(payload.byteLength, 12);
  return Buffer.concat([
    header,
    Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength),
  ]);
}

export function encodeJsonFrame(requestId: number, value: unknown): Buffer {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Sidecar JSON frame must be serializable');
  return encodeFrame('json', requestId, Buffer.from(json));
}

export function encodeBinaryFrame(requestId: number, payload: Uint8Array): Buffer {
  return encodeFrame('binary', requestId, payload);
}

export function parseJsonFrame(frame: SidecarFrame): unknown {
  if (frame.kind !== 'json') throw new TypeError('Expected a JSON sidecar frame');
  return JSON.parse(frame.payload.toString('utf8')) as unknown;
}

/** Incremental decoder for framed stdout; accepts arbitrary pipe chunk boundaries. */
export class SidecarFrameDecoder {
  private readonly header = Buffer.alloc(HEADER_BYTES);
  private headerBytes = 0;
  private current?: ReturnType<typeof parseHeader>;
  private payloadChunks: Buffer[] = [];
  private payloadBytes = 0;

  push(chunk: Uint8Array): SidecarFrame[] {
    const input = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const frames: SidecarFrame[] = [];
    let offset = 0;

    while (offset < input.length) {
      if (!this.current) {
        const count = Math.min(HEADER_BYTES - this.headerBytes, input.length - offset);
        input.copy(this.header, this.headerBytes, offset, offset + count);
        this.headerBytes += count;
        offset += count;
        if (this.headerBytes < HEADER_BYTES) continue;

        this.current = parseHeader(this.header);
        this.headerBytes = 0;
        this.payloadChunks = [];
        this.payloadBytes = 0;
        if (this.current.length === 0) frames.push(this.takeFrame());
        continue;
      }

      const count = Math.min(this.current.length - this.payloadBytes, input.length - offset);
      this.payloadChunks.push(input.subarray(offset, offset + count));
      this.payloadBytes += count;
      offset += count;
      if (this.payloadBytes === this.current.length) frames.push(this.takeFrame());
    }
    return frames;
  }

  finish(): void {
    if (this.current || this.headerBytes !== 0) throw new Error('Truncated sidecar frame stream');
  }

  private takeFrame(): SidecarFrame {
    const current = this.current;
    if (!current) throw new Error('Sidecar frame decoder state is invalid');
    const payload = Buffer.concat(this.payloadChunks, current.length);
    this.current = undefined;
    this.payloadChunks = [];
    this.payloadBytes = 0;
    return { kind: current.kind, requestId: current.requestId, payload };
  }
}
