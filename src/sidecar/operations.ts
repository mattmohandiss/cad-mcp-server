// The OCCT sidecar wire protocol: an internal, versioned JSON protocol spoken
// over framed stdio. Keeping the operation arguments and results in one place
// means a typo in an operation name or an argument key is a compile error
// rather than a runtime protocol failure.

/** A 3D coordinate or extent: a fixed-length tuple, not a variable-length array. */
export type Vec3 = [number, number, number];

/** A sidecar entity: a stable `id` plus kind-specific fields passed through. */
export interface SidecarEntity {
  id: string;
  /** Present on face entities. */
  bbox?: { min: Vec3; max: Vec3 };
  /** Entity centroid. */
  bbox_center?: readonly number[];
  [key: string]: unknown;
}

/** The `inspect` payload: model size, structure, and B-rep health. */
export interface SidecarInspect {
  solids: number;
  faces: number;
  edges: number;
  vertices: number;
  volume: number;
  surfaceArea: number;
  valid: boolean;
  bounds: { min: Vec3; max: Vec3 };
  xcaf?: {
    roots: number;
    rootAssemblies: number;
    components: number;
    occurrenceIds: string[];
  };
}

/** One measured pair of entities. */
export interface SidecarEntityPair {
  source_entity_id: string;
  target_entity_id: string;
  distance: number;
}

/** One per-entity measurement entry: the sidecar nests the payload under `results`. */
export interface SidecarMeasureEntry {
  results: Record<string, unknown>;
}

/** The `pmi` payload: GD&T declared by the file, as data rather than judgements. */
export interface SidecarPmi {
  units: { length: string; note: string };
  counts: {
    dimensions: number;
    geometricTolerances: number;
    datums: number;
    presentationSkipped: number;
  };
  dimensions: SidecarPmiDimension[];
  geometricTolerances: SidecarPmiTolerance[];
  datums: SidecarPmiDatum[];
  warnings: string[];
}

/** One dimensional callout. Values are millimetres whatever the model unit is. */
export interface SidecarPmiDimension {
  /** OCCT's dimension type code; `kind` is the readable equivalent. */
  type: number;
  /** OCCT's own semantic name, e.g. "diameter" or "linear distance". */
  kind: string;
  nominal: number;
  upperDeviation?: number;
  lowerDeviation?: number;
  lowerBound?: number;
  upperBound?: number;
  qualifier?: number;
  entityIds?: string[];
  secondaryEntityIds?: string[];
}

/** One geometric tolerance (flatness, position, ...). Values are millimetres. */
export interface SidecarPmiTolerance {
  type: number;
  kind: string;
  value: number;
  zoneShape: string;
  materialRequirement: string;
  zoneModifier?: number;
  /**
   * False when OCCT could not resolve the magnitude and left it at 0.0. A
   * genuine zero-at-MMC callout reads true, because it carries a modifier.
   */
  valueResolved: boolean;
  datums?: Array<{ name: string; position: number }>;
  entityIds?: string[];
  secondaryEntityIds?: string[];
}

/** One datum feature or datum target. */
export interface SidecarPmiDatum {
  name: string;
  position: number;
  isTarget: boolean;
  targetType?: string;
}

/** Arguments for each sidecar operation. */
export interface SidecarOps {
  hello: Record<string, never>;
  open: { path: string; systemLengthUnit?: number };
  pmi: { modelId: number };
  close: { modelId: number };
  inspect: { modelId: number };
  findEntities: {
    modelId: number;
    entityType: string;
    componentName?: string;
    entityIds?: readonly string[];
    filters?: Record<string, unknown>;
    limit?: number;
    offset?: number;
  };
  measureEntityDistances: {
    modelId: number;
    sources?: readonly string[];
    targets?: readonly string[];
    summary?: 'all' | 'minimum';
  };
  // The kind-specific fields below mirror `measure`'s input schema, renamed to
  // the sidecar's camelCase wire names.
  measureGeometry: {
    modelId: number;
    kind: string;
    entityIds?: readonly string[];
    direction?: readonly number[];
    directionMode?: string;
    origin?: readonly number[];
    originMode?: string;
    bidirectional?: boolean;
    spacingMm?: number;
    maxDistance?: number;
    points?: readonly (readonly number[])[];
    checks?: readonly string[];
    tolerance?: number;
    planeOrigin?: readonly number[];
    planeNormal?: readonly number[];
    detail?: string;
  };
  meshChunk: {
    modelId: number;
    faceIndices: readonly number[];
    deflection: number;
    angularDeflection: number;
  };
}

/**
 * Results for each operation. `measureGeometry` is polymorphic across the eight
 * measurement kinds, so its per-kind payload stays opaque to this layer.
 */
export interface SidecarResults {
  hello: { protocol: number; occt: string };
  open: { modelId: number };
  close: unknown;
  inspect: SidecarInspect;
  pmi: SidecarPmi;
  findEntities: { entities: SidecarEntity[]; total_matched: number };
  measureEntityDistances: {
    pair_count: number;
    pairs: SidecarEntityPair[];
    minimum: SidecarEntityPair | null;
  };
  measureGeometry: { results: SidecarMeasureEntry[] };
  meshChunk: Buffer;
}
