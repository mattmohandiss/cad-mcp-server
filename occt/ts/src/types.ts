/**
 * Branded handle type — prevents passing raw numbers as shape IDs.
 * Obtain handles from kernel methods; release via {@link OcctKernel.release}.
 */
declare const ShapeHandleBrand: unique symbol;
export type ShapeHandle = number & { readonly [ShapeHandleBrand]: never };

/** Triangle mesh data produced by BRepMesh tessellation. */
export interface Mesh {
    /** XYZ interleaved vertex positions. Length = vertexCount * 3. */
    positions: Float32Array;
    /** XYZ interleaved vertex normals. Length = vertexCount * 3. */
    normals: Float32Array;
    /** Triangle indices into the positions/normals arrays. */
    indices: Uint32Array;
    /** Number of vertices (positions.length / 3). */
    vertexCount: number;
    /** Number of triangles (indices.length / 3). */
    triangleCount: number;
    /** Per-face triangle groups: [triStart, triCount, faceHash] triples. Present when using meshShape(). */
    faceGroups?: Int32Array | undefined;
    /** Number of face groups. Present when using meshShape(). */
    faceCount?: number | undefined;
}

/** Axis-aligned bounding box (AABB). */
export interface BoundingBox {
    xmin: number;
    ymin: number;
    zmin: number;
    xmax: number;
    ymax: number;
    zmax: number;
}

/** 3D point or direction vector. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Options controlling BRepMesh tessellation quality. */
export interface TessellateOptions {
    /** Maximum chord deviation from the true surface. Default: 0.1 */
    linearDeflection?: number | undefined;
    /** Maximum angular deviation in radians. Default: 0.5 */
    angularDeflection?: number | undefined;
    /**
     * Interpret `linearDeflection` relative to each edge's length
     * (scale-independent meshing) instead of as an absolute distance.
     */
    relative?: boolean | undefined;
}

/** Options for WASM module initialization. */
export interface InitOptions {
    /**
     * Location of the WASM binary. Accepts:
     * - A string URL or filesystem path
     * - A `URL` object
     * - An `ArrayBuffer` or `Uint8Array` containing the WASM binary
     *
     * When omitted, the WASM file is auto-located next to the JS module
     * using `import.meta.url`.
     */
    wasm?: string | URL | ArrayBuffer | Uint8Array | undefined;

    /** @deprecated Use `wasm` instead. Browser URL to the .wasm file. */
    wasmUrl?: string | undefined;
    /** @deprecated Use `wasm` instead. Node.js filesystem path to the .wasm file. */
    wasmPath?: string | undefined;
}

/**
 * TopAbs_ShapeEnum values returned by getShapeType, in TopAbs ordinal order
 * (queryBatch indexes this array by the raw enum value). Single source of truth
 * for both the {@link ShapeType} union and runtime validation.
 */
export const SHAPE_TYPES = [
    "compound", "compsolid", "solid", "shell", "face", "wire", "edge", "vertex", "shape",
] as const;
/** TopAbs_ShapeEnum value returned by getShapeType. */
export type ShapeType = (typeof SHAPE_TYPES)[number];

/** TopAbs_Orientation values returned by shapeOrientation. */
export const SHAPE_ORIENTATIONS = ["forward", "reversed", "internal", "external"] as const;
/** TopAbs_Orientation value returned by shapeOrientation. */
export type ShapeOrientation = (typeof SHAPE_ORIENTATIONS)[number];

/** BRepClass_FaceClassifier results for a UV point relative to a face boundary. */
export const POINT_CLASSIFICATIONS = ["in", "on", "out"] as const;
/** BRepClass_FaceClassifier result for a UV point relative to a face boundary. */
export type PointClassification = (typeof POINT_CLASSIFICATIONS)[number];

/** Which extreme of a shape's bounding box to align to a target coordinate. */
export type AlignAnchor = "min" | "center" | "max";

/** Geom_Surface subclass identifier returned by surfaceType. */
export type SurfaceKind = "plane" | "cylinder" | "cone" | "sphere" | "torus" | "bspline" | "bezier" | "offset" | "revolution" | "extrusion" | (string & {});

/** Geom_Curve subclass identifier returned by curveType. */
export type CurveKind = "line" | "circle" | "ellipse" | "hyperbola" | "parabola" | "bspline" | "bezier" | "offset" | (string & {});

/** UV parameter bounds of a face surface. */
export interface UVBounds {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
}

/** Principal curvatures at a UV point on a face surface. */
export interface CurvatureData {
    /** Minimum principal curvature. */
    min: number;
    /** Maximum principal curvature. */
    max: number;
    /** Gaussian curvature (min * max). */
    gaussian: number;
    /** Mean curvature ((min + max) / 2). */
    mean: number;
}

/** Polyline edge data from wireframe tessellation. */
export interface EdgeData {
    /** XYZ interleaved edge sample points. Length = pointCount. */
    points: Float32Array;
    /** Per-edge groups: [pointStart, pointCount, edgeHash] triples. */
    edgeGroups: Int32Array;
    /** Total number of floats in points (= number of XYZ coords). */
    pointCount: number;
    /** Number of distinct edges. */
    edgeCount: number;
}

/** NURBS/BSpline curve data extracted from an edge via Geom_BSplineCurve. */
export interface NurbsCurveData {
    /** Polynomial degree of the BSpline. */
    degree: number;
    /** True if the curve uses rational weights. */
    rational: boolean;
    /** True if the curve is periodic. */
    periodic: boolean;
    /** Knot values. */
    knots: number[];
    /** Knot multiplicities (same length as knots). */
    multiplicities: number[];
    /** Flat [x,y,z, x,y,z, ...] control point coordinates. */
    poles: number[];
    /** Control point weights (same count as poles/3). */
    weights: number[];
}

/** Result from queryBatch: aggregated shape properties. */
export interface ShapeQueryResult {
    bbox: BoundingBox;
    volume: number;
    area: number;
    centerOfMass: Vec3;
    shapeType: ShapeType;
    isValid: boolean;
}

/** Concatenated mesh data for multiple shapes, produced by meshBatch. */
export interface MeshBatchData {
    /** Interleaved XYZ positions for all shapes. */
    positions: Float32Array;
    /** Interleaved XYZ normals for all shapes. */
    normals: Float32Array;
    /** Triangle indices for all shapes. */
    indices: Uint32Array;
    /** Per-shape offsets: [posStart, posCount, idxStart, idxCount] quads. */
    shapeOffsets: Int32Array;
    /** Number of shapes in the batch. */
    shapeCount: number;
    /** Total vertex count across all shapes. */
    vertexCount: number;
    /** Total triangle count across all shapes. */
    triangleCount: number;
}

/**
 * Structured error codes for programmatic error handling.
 * Use `switch (error.code)` instead of parsing error message strings.
 */
export enum OcctErrorCode {
    /** Shape construction failed (Build()/IsDone() returned false). */
    ConstructionFailed = "CONSTRUCTION_FAILED",
    /** Boolean operation failed (fuse/cut/common/intersect/section). */
    BooleanFailed = "BOOLEAN_FAILED",
    /** Referenced shape ID does not exist in the arena. */
    InvalidShapeId = "INVALID_SHAPE_ID",
    /** Tessellation or meshing operation failed. */
    TessellationFailed = "TESSELLATION_FAILED",
    /** STEP/STL/BREP import or export failed. */
    ImportExportFailed = "IMPORT_EXPORT_FAILED",
    /** Shape healing or repair operation failed. */
    HealingFailed = "HEALING_FAILED",
    /** OCCT kernel raised an internal error (Standard_Failure). */
    KernelError = "KERNEL_ERROR",
    /** Error does not match any known pattern. */
    Unknown = "UNKNOWN",
}

/**
 * Typed error thrown when an OCCT operation fails.
 * The `operation` field identifies which kernel method raised the error.
 * The `code` field enables programmatic error handling via `switch`.
 *
 * @example
 * ```ts
 * try {
 *   kernel.fuse(a, b);
 * } catch (e) {
 *   if (e instanceof OcctError) {
 *     switch (e.code) {
 *       case OcctErrorCode.BooleanFailed:
 *         // retry with simpler geometry
 *         break;
 *       case OcctErrorCode.InvalidShapeId:
 *         // shape was already released
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class OcctError extends Error {
    /** Name of the kernel method that failed. */
    readonly operation: string;
    /** Structured error code for programmatic handling. */
    readonly code: OcctErrorCode;

    constructor(operation: string, message: string, code?: OcctErrorCode) {
        super(`${operation}: ${message}`);
        this.name = "OcctError";
        this.operation = operation;
        this.code = code ?? classifyError(operation, message);
    }
}

/** Operation categories used to infer error codes from context. */
const BOOLEAN_OPS = new Set(["fuse", "cut", "common", "intersect", "section", "fuseAll", "cutAll", "split", "booleanPipeline"]);
const TESSELLATION_OPS = new Set(["tessellate", "wireframe", "meshShape", "meshBatch"]);
const IO_OPS = new Set(["importStep", "exportStep", "importStl", "exportStl", "toBREP", "fromBREP"]);
const HEALING_OPS = new Set(["fixShape", "unifySameDomain", "healSolid", "healFace", "healWire", "fixFaceOrientations", "removeDegenerateEdges", "fixWireOnFace", "buildCurves3d"]);

/**
 * Classify an error into a structured code by matching known C++ error patterns
 * and operation context.
 */
function classifyError(operation: string, message: string): OcctErrorCode {
    const msg = message.toLowerCase();

    // Exact pattern matches from C++ facade
    if (msg.includes("invalid shape id")) return OcctErrorCode.InvalidShapeId;
    if (msg.includes("boolean operation failed")) return OcctErrorCode.BooleanFailed;
    if (msg.includes("construction failed")) return OcctErrorCode.ConstructionFailed;

    // Operation-category fallback
    if (BOOLEAN_OPS.has(operation)) return OcctErrorCode.BooleanFailed;
    if (TESSELLATION_OPS.has(operation)) return OcctErrorCode.TessellationFailed;
    if (IO_OPS.has(operation)) return OcctErrorCode.ImportExportFailed;
    if (HEALING_OPS.has(operation)) return OcctErrorCode.HealingFailed;

    // "operation failed" is the generic SetupShape/FilletLike pattern
    if (msg.includes("operation failed")) return OcctErrorCode.ConstructionFailed;

    // Unmatched errors from known OCCT operations are Standard_Failure propagations
    if (operation) return OcctErrorCode.KernelError;

    return OcctErrorCode.Unknown;
}

/**
 * Run `fn`, re-throwing any failure as an {@link OcctError} tagged with the
 * given operation name. Shared by the kernel and the XCAF document so error
 * classification stays in one place.
 */
export function wrap<T>(operation: string, fn: () => T): T {
    try {
        return fn();
    } catch (e: unknown) {
        if (e instanceof OcctError) {
            // Already classified by an inner wrapped call. Preserve the original
            // (most-specific) code and just retag the operation, so re-wrapping
            // a passthrough like cacheStep/loadCached doesn't reclassify e.g.
            // ImportExportFailed down to KernelError.
            throw new OcctError(operation, e.message, e.code);
        }
        if (e instanceof Error) {
            throw new OcctError(operation, e.message);
        }
        throw new OcctError(operation, String(e));
    }
}
