import { OcctKernel } from 'occt-wasm';

let kernelPromise: Promise<OcctKernel> | undefined;

export async function getOcctKernel(): Promise<OcctKernel> {
  kernelPromise ??= OcctKernel.init();
  return kernelPromise;
}
