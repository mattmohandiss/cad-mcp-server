function dotProduct(v1: number[], v2: number[]): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function normalizeVector(v: number[]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function angleDegreesNormalized(u1: number[], u2: number[]): number {
  const dot = Math.max(-1, Math.min(1, dotProduct(u1, u2)));
  return (Math.acos(dot) * 180) / Math.PI;
}
