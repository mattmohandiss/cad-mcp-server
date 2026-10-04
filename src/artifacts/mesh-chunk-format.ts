const headerByteLength = 32;

export function encodeMeshChunk(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  triangleToFace: Uint32Array,
) {
  if (
    positions.length % 3 !== 0 ||
    normals.length !== positions.length ||
    indices.length % 3 !== 0 ||
    triangleToFace.length !== indices.length / 3
  ) {
    throw new Error('CAD mesh chunk arrays have inconsistent lengths');
  }

  const vertexCount = positions.length / 3;
  for (const index of indices) {
    if (index >= vertexCount) throw new Error('CAD mesh chunk contains an invalid vertex index');
  }

  const header = Buffer.alloc(headerByteLength);
  header.write('CVM1', 0, 'ascii');
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(vertexCount, 8);
  header.writeUInt32LE(indices.length, 12);
  header.writeUInt32LE(triangleToFace.length, 16);
  header.writeUInt32LE(positions.byteLength, 20);
  header.writeUInt32LE(normals.byteLength, 24);
  header.writeUInt32LE(indices.byteLength, 28);
  return Buffer.concat([
    header,
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
    Buffer.from(triangleToFace.buffer, triangleToFace.byteOffset, triangleToFace.byteLength),
  ]);
}
