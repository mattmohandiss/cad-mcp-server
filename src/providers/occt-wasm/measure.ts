import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { BoundingBox, Dimensions } from '../schema.js';

export function toBoundingBox(kernel: OcctKernel, shape: ShapeHandle): BoundingBox {
  const bbox = kernel.getBoundingBox(shape, false);

  return {
    min: { x: bbox.xmin, y: bbox.ymin, z: bbox.zmin },
    max: { x: bbox.xmax, y: bbox.ymax, z: bbox.zmax },
  };
}

export function getDimensions(boundingBox: BoundingBox): Dimensions {
  return {
    width: boundingBox.max.x - boundingBox.min.x,
    height: boundingBox.max.y - boundingBox.min.y,
    depth: boundingBox.max.z - boundingBox.min.z,
  };
}

export function guessShapeClass(dimensions: Dimensions): 'box' | 'cylindrical' | 'complex' {
  const { width, height, depth } = dimensions;

  if (width > height * 2 || width > depth * 2) return 'box';
  if (Math.abs(height - depth) < Math.max(height, depth) * 0.2) return 'cylindrical';
  return 'complex';
}
