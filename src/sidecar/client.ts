import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { SidecarFrameDecoder, encodeJsonFrame, parseJsonFrame } from './protocol.js';
import type { SidecarFrame } from './protocol.js';

interface SidecarEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  kernelMs?: number;
}

interface Pending {
  kind: 'json' | 'binary';
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  operation: string;
}

export interface SidecarClientOptions {
  executable: string;
  launcher?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  onLog?: (text: string) => void;
}

/** Owns one persistent OCCT process; geometry and handles never cross IPC. */
export class SidecarClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly decoder = new SidecarFrameDecoder();
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private exited = false;
  private stopping = false;
  private failed = false;

  constructor(options: SidecarClientOptions) {
    const env = options.env ? { ...process.env, ...options.env } : process.env;
    this.child = options.launcher
      ? spawn(options.launcher, [options.executable], {
          stdio: 'pipe',
          shell: false,
          cwd: options.cwd,
          env,
        })
      : spawn(options.executable, [], { stdio: 'pipe', shell: false, cwd: options.cwd, env });

    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const frame of this.decoder.push(chunk)) this.receive(frame);
      } catch (error) {
        this.failAll(asError(error));
        this.child.kill();
      }
    });
    this.child.stdout.on('end', () => {
      try {
        this.decoder.finish();
      } catch (error) {
        this.failAll(asError(error));
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (text: string) => options.onLog?.(text));
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('exit', (code, signal) => {
      this.exited = true;
      if (!this.stopping) {
        this.failAll(new Error(`OCCT sidecar exited: code=${code}, signal=${signal}`));
      }
    });
    this.child.stdin.on('error', (error) => this.failAll(error));
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get isAlive(): boolean {
    return !this.exited && !this.stopping && !this.failed;
  }

  request<T>(
    operation: string,
    args: Record<string, unknown> = {},
    timeoutMs = 120_000,
  ): Promise<{ result: T; kernelMs: number }> {
    return this.send<{ result: T; kernelMs: number }>('json', operation, args, timeoutMs);
  }

  requestBinary(
    operation: string,
    args: Record<string, unknown> = {},
    timeoutMs = 120_000,
  ): Promise<Buffer> {
    return this.send<Buffer>('binary', operation, args, timeoutMs);
  }

  private send<T>(
    kind: Pending['kind'],
    operation: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    if (this.exited || this.stopping) return Promise.reject(new Error('OCCT sidecar is closed'));
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.reject(new RangeError('Sidecar timeout must be positive'));
    }
    const requestId = this.nextRequestId();
    const frame = encodeJsonFrame(requestId, { op: operation, args });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `OCCT sidecar timed out during ${operation}; process handles are invalid`,
        );
        this.failAll(error);
        this.child.kill();
      }, timeoutMs);
      timer.unref();
      this.pending.set(requestId, {
        kind,
        operation,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.child.stdin.write(frame, (error) => {
        if (error) {
          this.failAll(error);
          this.child.kill();
        }
      });
    });
  }

  private nextRequestId(): number {
    for (let attempts = 0; attempts <= this.pending.size; attempts += 1) {
      this.sequence = (this.sequence % 0xffff_ffff) + 1;
      if (!this.pending.has(this.sequence)) return this.sequence;
    }
    throw new Error('No available sidecar request IDs');
  }

  private receive(frame: SidecarFrame): void {
    const pending = this.pending.get(frame.requestId);
    if (!pending) throw new Error(`Unmatched sidecar response id: ${frame.requestId}`);
    if (pending.kind !== frame.kind && !(pending.kind === 'binary' && frame.kind === 'json')) {
      throw new Error(`Unexpected ${frame.kind} response for ${pending.operation}`);
    }

    this.pending.delete(frame.requestId);
    clearTimeout(pending.timer);
    if (frame.kind === 'binary') {
      pending.resolve(frame.payload);
      return;
    }

    const envelope = parseJsonFrame(frame) as SidecarEnvelope<unknown>;
    if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') {
      throw new Error('Invalid sidecar JSON response envelope');
    }
    if (!envelope.ok) {
      pending.reject(new Error(envelope.error ?? 'OCCT sidecar operation failed'));
      return;
    }
    pending.resolve({ result: envelope.result, kernelMs: envelope.kernelMs ?? 0 });
  }

  private failAll(error: Error): void {
    this.failed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop(): Promise<void> {
    if (this.exited) return;
    this.stopping = true;
    this.failAll(new Error('OCCT sidecar is stopping'));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill(), 2_000);
      timer.unref();
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      this.child.stdin.end();
    });
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
