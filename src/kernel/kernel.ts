import { OcctKernel } from 'occt-wasm';

let kernelPromise: Promise<OcctKernel> | undefined;

export async function getOcctKernel(): Promise<OcctKernel> {
  if (!kernelPromise) kernelPromise = OcctKernel.init();
  try {
    return await kernelPromise;
  } catch (error) {
    kernelPromise = undefined;
    throw error;
  }
}
