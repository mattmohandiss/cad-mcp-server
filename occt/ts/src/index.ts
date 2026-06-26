/**
 * occt-wasm — OCCT compiled to WASM with clean TypeScript bindings.
 *
 * @example
 * ```ts
 * import { OcctKernel } from 'occt-wasm';
 *
 * const kernel = await OcctKernel.init();
 * const box = kernel.makeBox(10, 20, 30);
 * const mesh = kernel.tessellate(box);
 * console.log(`${mesh.triangleCount} triangles`);
 * kernel.release(box);
 * ```
 */

export {
    OcctError,
    OcctErrorCode,
    type AlignAnchor,
    type BoundingBox,
    type CurveKind,
    type CurvatureData,
    type EdgeData,
    type InitOptions,
    type Mesh,
    type MeshBatchData,
    type NurbsCurveData,
    type ShapeQueryResult,
    type PointClassification,
    type ShapeHandle,
    type ShapeOrientation,
    type ShapeType,
    type SurfaceKind,
    type TessellateOptions,
    type UVBounds,
    type Vec3,
} from "./types.js";

import type {
    AlignAnchor,
    BoundingBox,
    CurveKind,
    CurvatureData,
    EdgeData,
    InitOptions,
    Mesh,
    MeshBatchData,
    NurbsCurveData,
    PointClassification,
    ShapeHandle,
    ShapeQueryResult,
    ShapeOrientation,
    ShapeType,
    SurfaceKind,
    TessellateOptions,
    UVBounds,
    Vec3,
} from "./types.js";
import { wrap } from "./types.js";
import { SHAPE_TYPES, SHAPE_ORIENTATIONS, POINT_CLASSIFICATIONS } from "./types.js";
import type {
    OcctWasmModule,
    OcctRawKernel,
    RawMeshData,
    EmbindVectorU32,
    EmbindVectorF64,
    EmbindVectorI32,
} from "./raw-types.js";

// The raw Embind type surface lives in raw-types.ts. Re-export the two public
// entry types so getRawModule()/getRawKernel() consumers keep their types.
export type { OcctWasmModule, OcctRawKernel } from "./raw-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handle(id: number): ShapeHandle {
    return id as ShapeHandle;
}

// Allowed values for the closed string-union enums returned by the kernel,
// derived from the single source of truth in types.ts so they can't drift.
// (SurfaceKind/CurveKind are open unions — `string & {}` — so any string is
// valid by design and needs no check.)
const SHAPE_TYPE_VALUES = new Set<string>(SHAPE_TYPES);
const SHAPE_ORIENTATION_VALUES = new Set<string>(SHAPE_ORIENTATIONS);
const POINT_CLASSIFICATION_VALUES = new Set<string>(POINT_CLASSIFICATIONS);

/**
 * Coerce a raw kernel string into a closed union, throwing if the kernel ever
 * returns an unexpected value instead of silently casting it into a lie. Called
 * inside `wrap(...)`, so the throw surfaces as a classified `OcctError`.
 */
function asEnum<T extends string>(value: string, allowed: ReadonlySet<string>, label: string): T {
    if (!allowed.has(value)) {
        throw new Error(`unexpected ${label} from kernel: "${value}"`);
    }
    return value as T;
}

/**
 * Safety net: releases the raw Embind kernel if an OcctKernel instance is
 * garbage-collected without being disposed. Prefer `using` or explicit
 * `kernel[Symbol.dispose]()` — the FinalizationRegistry is a last resort.
 */
const kernelRegistry = new FinalizationRegistry<OcctRawKernel>((raw) => {
    try {
        raw.releaseAll();
        raw.delete();
    } catch {
        // Already disposed — ignore.
    }
});

// ---------------------------------------------------------------------------
// OcctKernel
// ---------------------------------------------------------------------------

/**
 * OCCT kernel compiled to WASM. Arena-based shape management
 * with branded handle types for type safety.
 *
 * Create via `OcctKernel.init()`. Dispose via `kernel[Symbol.dispose]()` or
 * the `using` keyword. A FinalizationRegistry safety net catches leaked
 * instances, but deterministic disposal is strongly preferred.
 */
export class OcctKernel {
    readonly #raw: OcctRawKernel;
    readonly #module: OcctWasmModule;

    private constructor(module: OcctWasmModule) {
        this.#module = module;
        this.#raw = new module.OcctKernel();
        kernelRegistry.register(this, this.#raw, this);
    }

    /**
     * Initialize the WASM module and create a kernel instance.
     *
     * @example
     * ```ts
     * // Auto-detect (works in browser, Node.js, and Workers):
     * const kernel = await OcctKernel.init();
     *
     * // Explicit WASM location:
     * const kernel = await OcctKernel.init({ wasm: '/path/to/occt-wasm.wasm' });
     *
     * // From pre-fetched binary:
     * const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
     * const kernel = await OcctKernel.init({ wasm: binary });
     * ```
     */
    static async init(options?: InitOptions): Promise<OcctKernel> {
        // @ts-expect-error -- occt-wasm.js is generated at build time, no .d.ts
        const imported = await import(/* webpackIgnore: true */ "./occt-wasm.js");
        const createModule = imported.default as (
            opts: Record<string, unknown>,
        ) => Promise<OcctWasmModule>;

        const moduleOpts: Record<string, unknown> = {};

        // Resolve the WASM source: new `wasm` option > legacy `wasmUrl`/`wasmPath`
        const wasmSource = options?.wasm ?? options?.wasmUrl ?? options?.wasmPath;

        if (wasmSource instanceof ArrayBuffer || wasmSource instanceof Uint8Array) {
            // Pre-loaded binary — pass directly to Emscripten
            // For Uint8Array views with non-zero byteOffset, slice to get the correct region
            const bytes = wasmSource instanceof Uint8Array
                ? wasmSource.buffer.slice(wasmSource.byteOffset, wasmSource.byteOffset + wasmSource.byteLength)
                : wasmSource;
            moduleOpts["wasmBinary"] = bytes;
        } else if (wasmSource) {
            // String or URL — use locateFile
            const location = wasmSource instanceof URL ? wasmSource.href : wasmSource;
            moduleOpts["locateFile"] = (path: string) => {
                if (path.endsWith(".wasm")) return location;
                return path;
            };
        }
        // When no source is given, Emscripten's default locateFile resolves
        // relative to the JS module URL, which works when .wasm is co-located.

        const module = await createModule(moduleOpts);
        return new OcctKernel(module);
    }

    // =======================================================================
    // Construction
    // =======================================================================

    makeVertex(x: number, y: number, z: number): ShapeHandle {
        return wrap("makeVertex", () => handle(this.#raw.makeVertex(x, y, z)));
    }

    makeEdge(v1: ShapeHandle, v2: ShapeHandle): ShapeHandle {
        return wrap("makeEdge", () => handle(this.#raw.makeEdge(v1, v2)));
    }

    makeLineEdge(start: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeLineEdge", () =>
            handle(this.#raw.makeLineEdge(start.x, start.y, start.z, end.x, end.y, end.z)),
        );
    }

    makeCircleEdge(center: Vec3, normal: Vec3, radius: number): ShapeHandle {
        return wrap("makeCircleEdge", () =>
            handle(this.#raw.makeCircleEdge(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                radius,
            )),
        );
    }

    makeCircleArc(center: Vec3, normal: Vec3, radius: number, startAngle: number, endAngle: number): ShapeHandle {
        return wrap("makeCircleArc", () =>
            handle(this.#raw.makeCircleArc(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                radius, startAngle, endAngle,
            )),
        );
    }

    makeArcEdge(start: Vec3, mid: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeArcEdge", () =>
            handle(this.#raw.makeArcEdge(
                start.x, start.y, start.z,
                mid.x, mid.y, mid.z,
                end.x, end.y, end.z,
            )),
        );
    }

    makeEllipseEdge(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number): ShapeHandle {
        return wrap("makeEllipseEdge", () =>
            handle(this.#raw.makeEllipseEdge(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                majorRadius, minorRadius,
            )),
        );
    }

    makeEllipseArc(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number): ShapeHandle {
        return wrap("makeEllipseArc", () =>
            handle(this.#raw.makeEllipseArc(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                majorRadius, minorRadius,
                startAngle, endAngle,
            )),
        );
    }

    makeBezierEdge(controlPoints: Vec3[]): ShapeHandle {
        return wrap("makeBezierEdge", () => {
            const flat = this.#flattenPoints(controlPoints);
            try { return handle(this.#raw.makeBezierEdge(flat)); }
            finally { flat.delete(); }
        });
    }

    makeBSplineEdge(
        poles: number[],
        weights: number[],
        knots: number[],
        multiplicities: number[],
        degree: number,
        periodic = false,
    ): ShapeHandle {
        return wrap("makeBSplineEdge", () =>
            this.#withF64(poles, (polesVec) =>
                this.#withF64(weights, (weightsVec) =>
                    this.#withF64(knots, (knotsVec) =>
                        this.#withI32(multiplicities, (multsVec) =>
                            handle(this.#raw.makeBSplineEdge(polesVec, weightsVec, knotsVec, multsVec, degree, periodic)),
                        ),
                    ),
                ),
            ),
        );
    }

    makeTangentArc(start: Vec3, tangent: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeTangentArc", () =>
            handle(this.#raw.makeTangentArc(
                start.x, start.y, start.z,
                tangent.x, tangent.y, tangent.z,
                end.x, end.y, end.z,
            )),
        );
    }

    makeHelixWire(origin: Vec3, axis: Vec3, pitch: number, height: number, radius: number): ShapeHandle {
        return wrap("makeHelixWire", () =>
            handle(this.#raw.makeHelixWire(
                origin.x, origin.y, origin.z,
                axis.x, axis.y, axis.z,
                pitch, height, radius,
            )),
        );
    }

    makeWire(edges: ShapeHandle[]): ShapeHandle {
        return wrap("makeWire", () => {
            return this.#withU32(edges, (vec) => handle(this.#raw.makeWire(vec)));
        });
    }

    makeFace(wire: ShapeHandle): ShapeHandle {
        return wrap("makeFace", () => handle(this.#raw.makeFace(wire)));
    }

    addHolesInFace(face: ShapeHandle, holeWires: ShapeHandle[]): ShapeHandle {
        return wrap("addHolesInFace", () => {
            return this.#withU32(holeWires, (vec) => handle(this.#raw.addHolesInFace(face, vec)));
        });
    }

    removeHolesFromFace(face: ShapeHandle, holeIndices: number[]): ShapeHandle {
        return wrap("removeHolesFromFace", () => {
            return this.#withI32(holeIndices, (vec) => handle(this.#raw.removeHolesFromFace(face, vec)));
        });
    }

    makeSolid(shell: ShapeHandle): ShapeHandle {
        return wrap("makeSolid", () => handle(this.#raw.makeSolid(shell)));
    }

    sew(shapes: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("sew", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.sew(vec, tolerance)));
        });
    }

    sewAndSolidify(faces: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("sewAndSolidify", () => {
            return this.#withU32(faces, (vec) => handle(this.#raw.sewAndSolidify(vec, tolerance)));
        });
    }

    buildSolidFromFaces(faces: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("buildSolidFromFaces", () => {
            return this.#withU32(faces, (vec) => handle(this.#raw.buildSolidFromFaces(vec, tolerance)));
        });
    }

    makeCompound(shapes: ShapeHandle[]): ShapeHandle {
        return wrap("makeCompound", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.makeCompound(vec)));
        });
    }

    buildTriFace(a: Vec3, b: Vec3, c: Vec3): ShapeHandle {
        return wrap("buildTriFace", () =>
            handle(this.#raw.buildTriFace(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)),
        );
    }

    makeFaceOnSurface(face: ShapeHandle, wire: ShapeHandle): ShapeHandle {
        return wrap("makeFaceOnSurface", () => handle(this.#raw.makeFaceOnSurface(face, wire)));
    }

    makeNullShape(): ShapeHandle {
        return wrap("makeNullShape", () => handle(this.#raw.makeNullShape()));
    }

    // =======================================================================
    // Transforms
    // =======================================================================

    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("translate", () => handle(this.#raw.translate(shape, dx, dy, dz)));
    }

    /**
     * Translate along X so the chosen bounding-box anchor lands at `target`.
     * Returns a new shape; the input is left untouched.
     */
    alignX(shape: ShapeHandle, target = 0, anchor: AlignAnchor = "center"): ShapeHandle {
        return wrap("alignX", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.xmin : anchor === "max" ? bb.xmax : (bb.xmin + bb.xmax) / 2;
            return handle(this.#raw.translate(shape, target - cur, 0, 0));
        });
    }

    /** Translate along Y so the chosen bounding-box anchor lands at `target`. */
    alignY(shape: ShapeHandle, target = 0, anchor: AlignAnchor = "center"): ShapeHandle {
        return wrap("alignY", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.ymin : anchor === "max" ? bb.ymax : (bb.ymin + bb.ymax) / 2;
            return handle(this.#raw.translate(shape, 0, target - cur, 0));
        });
    }

    /** Translate along Z so the chosen bounding-box anchor lands at `target`. */
    alignZ(shape: ShapeHandle, target = 0, anchor: AlignAnchor = "center"): ShapeHandle {
        return wrap("alignZ", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.zmin : anchor === "max" ? bb.zmax : (bb.zmin + bb.zmax) / 2;
            return handle(this.#raw.translate(shape, 0, 0, target - cur));
        });
    }

    rotate(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
    ): ShapeHandle {
        return wrap("rotate", () =>
            handle(this.#raw.rotate(
                shape,
                axis.point.x, axis.point.y, axis.point.z,
                axis.direction.x, axis.direction.y, axis.direction.z,
                angleRad,
            )),
        );
    }

    scale(shape: ShapeHandle, center: Vec3, factor: number): ShapeHandle {
        return wrap("scale", () =>
            handle(this.#raw.scale(shape, center.x, center.y, center.z, factor)),
        );
    }

    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): ShapeHandle {
        return wrap("mirror", () =>
            handle(this.#raw.mirror(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z)),
        );
    }

    copy(shape: ShapeHandle): ShapeHandle {
        return wrap("copy", () => handle(this.#raw.copy(shape)));
    }

    /** Apply a 3x4 row-major affine transformation matrix (12 doubles: [r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]). */
    transform(shape: ShapeHandle, matrix: number[]): ShapeHandle {
        return wrap("transform", () => {
            return this.#withF64(matrix, (vec) => handle(this.#raw.transform(shape, vec)));
        });
    }

    /** Apply a general (possibly non-affine) 3x4 row-major transformation matrix (12 doubles). */
    generalTransform(shape: ShapeHandle, matrix: number[]): ShapeHandle {
        return wrap("generalTransform", () => {
            return this.#withF64(matrix, (vec) => handle(this.#raw.generalTransform(shape, vec)));
        });
    }

    linearPattern(shape: ShapeHandle, direction: Vec3, spacing: number, count: number): ShapeHandle {
        return wrap("linearPattern", () =>
            handle(this.#raw.linearPattern(shape, direction.x, direction.y, direction.z, spacing, count)),
        );
    }

    circularPattern(shape: ShapeHandle, center: Vec3, axis: Vec3, angle: number, count: number): ShapeHandle {
        return wrap("circularPattern", () =>
            handle(this.#raw.circularPattern(
                shape,
                center.x, center.y, center.z,
                axis.x, axis.y, axis.z,
                angle, count,
            )),
        );
    }

    /** Compose two 3x4 row-major transformation matrices. Returns a 12-element array. */
    composeTransform(m1: number[], m2: number[]): number[] {
        return wrap("composeTransform", () =>
            this.#withF64(m1, (v1) =>
                this.#withF64(m2, (v2) =>
                    this.#drainVector(this.#raw.composeTransform(v1, v2), Float64Array),
                ),
            ),
        );
    }

    // =======================================================================
    // Batch Operations
    // =======================================================================

    /** Translate multiple shapes by their respective offsets in a single WASM call. */
    translateBatch(shapes: ShapeHandle[], offsets: number[]): ShapeHandle[] {
        return wrap("translateBatch", () =>
            this.#withU32(shapes, (ids) =>
                this.#withF64(offsets, (off) =>
                    this.#vecToHandles(this.#raw.translateBatch(ids, off)),
                ),
            ),
        );
    }

    /** Query multiple shapes in a single WASM call: bbox, volume, area, center of mass, type, validity. */
    queryBatch(shapes: ShapeHandle[]): ShapeQueryResult[] {
        return wrap("queryBatch", () =>
            this.#withU32(shapes, (ids) => {
                const arr = this.#drainVector(this.#raw.queryBatch(ids), Float64Array);
                const STRIDE = 14;
                const results: ShapeQueryResult[] = [];
                for (let i = 0; i < shapes.length; i++) {
                    const o = i * STRIDE;
                    results.push({
                        volume: arr[o]!,
                        area: arr[o + 1]!,
                        bbox: { xmin: arr[o + 2]!, ymin: arr[o + 3]!, zmin: arr[o + 4]!, xmax: arr[o + 5]!, ymax: arr[o + 6]!, zmax: arr[o + 7]! },
                        centerOfMass: { x: arr[o + 8]!, y: arr[o + 9]!, z: arr[o + 10]! },
                        shapeType: SHAPE_TYPES[arr[o + 11]!] ?? "shape",
                        isValid: arr[o + 12] === 1.0,
                    });
                }
                return results;
            }),
        );
    }

    /** Apply 3x4 affine transforms to multiple shapes in a single WASM call. */
    transformBatch(shapes: ShapeHandle[], matrices: number[]): ShapeHandle[] {
        return wrap("transformBatch", () =>
            this.#withU32(shapes, (ids) =>
                this.#withF64(matrices, (mats) =>
                    this.#vecToHandles(this.#raw.transformBatch(ids, mats)),
                ),
            ),
        );
    }

    /** Rotate multiple shapes in a single WASM call. */
    rotateBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[] {
        return wrap("rotateBatch", () =>
            this.#withU32(shapes, (ids) =>
                this.#withF64(params, (p) =>
                    this.#vecToHandles(this.#raw.rotateBatch(ids, p)),
                ),
            ),
        );
    }

    /** Scale multiple shapes in a single WASM call. */
    scaleBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[] {
        return wrap("scaleBatch", () =>
            this.#withU32(shapes, (ids) =>
                this.#withF64(params, (p) =>
                    this.#vecToHandles(this.#raw.scaleBatch(ids, p)),
                ),
            ),
        );
    }

    /** Mirror multiple shapes in a single WASM call. */
    mirrorBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[] {
        return wrap("mirrorBatch", () =>
            this.#withU32(shapes, (ids) =>
                this.#withF64(params, (p) =>
                    this.#vecToHandles(this.#raw.mirrorBatch(ids, p)),
                ),
            ),
        );
    }

    // =======================================================================
    // Topology
    // =======================================================================

    getShapeType(shape: ShapeHandle): ShapeType {
        return wrap("getShapeType", () =>
            asEnum<ShapeType>(this.#raw.getShapeType(shape), SHAPE_TYPE_VALUES, "shape type"),
        );
    }

    /** True if the shape is a compound. */
    isCompound(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "compound"; }

    /** True if the shape is a comp-solid. */
    isCompSolid(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "compsolid"; }

    /** True if the shape is a solid. */
    isSolid(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "solid"; }

    /** True if the shape is a shell. */
    isShell(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "shell"; }

    /** True if the shape is a face. */
    isFace(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "face"; }

    /** True if the shape is a wire. */
    isWire(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "wire"; }

    /** True if the shape is an edge. */
    isEdge(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "edge"; }

    /** True if the shape is a vertex. */
    isVertex(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "vertex"; }

    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle[] {
        return wrap("getSubShapes", () => this.#vecToHandles(this.#raw.getSubShapes(shape, type)));
    }

    downcast(shape: ShapeHandle, targetType: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle {
        return wrap("downcast", () => handle(this.#raw.downcast(shape, targetType)));
    }

    distanceBetween(a: ShapeHandle, b: ShapeHandle): number {
        return wrap("distanceBetween", () => this.#raw.distanceBetween(a, b));
    }

    isSame(a: ShapeHandle, b: ShapeHandle): boolean {
        return wrap("isSame", () => this.#raw.isSame(a, b));
    }

    isEqual(a: ShapeHandle, b: ShapeHandle): boolean {
        return wrap("isEqual", () => this.#raw.isEqual(a, b));
    }

    isNull(shape: ShapeHandle): boolean {
        return wrap("isNull", () => this.#raw.isNull(shape));
    }

    hashCode(shape: ShapeHandle, upperBound: number): number {
        return wrap("hashCode", () => this.#raw.hashCode(shape, upperBound));
    }

    shapeOrientation(shape: ShapeHandle): ShapeOrientation {
        return wrap("shapeOrientation", () =>
            asEnum<ShapeOrientation>(
                this.#raw.shapeOrientation(shape),
                SHAPE_ORIENTATION_VALUES,
                "shape orientation",
            ),
        );
    }

    sharedEdges(faceA: ShapeHandle, faceB: ShapeHandle): ShapeHandle[] {
        return wrap("sharedEdges", () => this.#vecToHandles(this.#raw.sharedEdges(faceA, faceB)));
    }

    adjacentFaces(shape: ShapeHandle, face: ShapeHandle): ShapeHandle[] {
        return wrap("adjacentFaces", () => this.#vecToHandles(this.#raw.adjacentFaces(shape, face)));
    }

    iterShapes(shape: ShapeHandle): ShapeHandle[] {
        return wrap("iterShapes", () => this.#vecToHandles(this.#raw.iterShapes(shape)));
    }

    /** Returns a flat array mapping edge hashes to face hashes. */
    edgeToFaceMap(shape: ShapeHandle, hashUpperBound: number): number[] {
        return wrap("edgeToFaceMap", () => {
            const vec = this.#raw.edgeToFaceMap(shape, hashUpperBound);
            return this.#drainVector(vec, Int32Array);
        });
    }

    // =======================================================================
    // Tessellation
    // =======================================================================

    /** Tessellate a shape into a triangle mesh. Returns copied data (safe to keep). */
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Mesh {
        return wrap("tessellate", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            const raw = options?.relative
                ? this.#raw.tessellateRelative(shape, linDefl, angDefl)
                : this.#raw.tessellate(shape, linDefl, angDefl);
            return this.#extractMesh(raw);
        });
    }

    /** Sample edges as polylines for wireframe rendering. */
    wireframe(shape: ShapeHandle, deflection = 0.1): EdgeData {
        return wrap("wireframe", () => {
            const raw = this.#raw.wireframe(shape, deflection);
            try {
                const points = new Float32Array(
                    this.#module.HEAPF32.buffer.slice(
                        raw.getPointsPtr(),
                        raw.getPointsPtr() + raw.pointCount * 4,
                    ),
                );
                const edgeCount = raw.edgeGroupCount / 3;
                const edgeGroups = new Int32Array(
                    this.#module.HEAP32.buffer.slice(
                        raw.getEdgeGroupsPtr(),
                        raw.getEdgeGroupsPtr() + raw.edgeGroupCount * 4,
                    ),
                );
                return { points, edgeGroups, pointCount: raw.pointCount, edgeCount };
            } finally {
                raw.delete();
            }
        });
    }

    hasTriangulation(shape: ShapeHandle): boolean {
        return wrap("hasTriangulation", () => this.#raw.hasTriangulation(shape));
    }

    /** Tessellate with face group data (per-face triangle ranges + hashes). */
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Mesh {
        return wrap("meshShape", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            return this.#extractMeshWithFaceGroups(this.#raw.meshShape(shape, linDefl, angDefl));
        });
    }

    /** Tessellate multiple shapes in a single WASM call. */
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): MeshBatchData {
        return wrap("meshBatch", () =>
            this.#withU32(shapes, (ids) => {
                const linDefl = options?.linearDeflection ?? 0.1;
                const angDefl = options?.angularDeflection ?? 0.5;
                const raw = this.#raw.meshBatch(ids, linDefl, angDefl);
                try {
                    const positions = new Float32Array(
                        this.#module.HEAPF32.buffer.slice(
                            raw.getPositionsPtr(),
                            raw.getPositionsPtr() + raw.positionCount * 4,
                        ),
                    );
                    const normals = new Float32Array(
                        this.#module.HEAPF32.buffer.slice(
                            raw.getNormalsPtr(),
                            raw.getNormalsPtr() + raw.normalCount * 4,
                        ),
                    );
                    const indices = new Uint32Array(
                        this.#module.HEAPU32.buffer.slice(
                            raw.getIndicesPtr(),
                            raw.getIndicesPtr() + raw.indexCount * 4,
                        ),
                    );
                    const shapeOffsets = new Int32Array(
                        this.#module.HEAP32.buffer.slice(
                            raw.getShapeOffsetsPtr(),
                            raw.getShapeOffsetsPtr() + raw.shapeCount * 4 * 4,
                        ),
                    );
                    return {
                        positions,
                        normals,
                        indices,
                        shapeOffsets,
                        shapeCount: raw.shapeCount,
                        vertexCount: raw.positionCount / 3,
                        triangleCount: raw.indexCount / 3,
                    };
                } finally {
                    raw.delete();
                }
            }),
        );
    }

    // =======================================================================
    // I/O
    // =======================================================================

    importStep(data: string | ArrayBuffer): ShapeHandle {
        return wrap("importStep", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStep(str));
        });
    }

    exportStep(shape: ShapeHandle): string {
        return wrap("exportStep", () => this.#raw.exportStep(shape));
    }

    importStl(data: string | ArrayBuffer): ShapeHandle {
        return wrap("importStl", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStl(str));
        });
    }

    exportStl(shape: ShapeHandle, linearDeflection = 0.1, ascii = false): string {
        return wrap("exportStl", () => this.#raw.exportStl(shape, linearDeflection, ascii));
    }

    toBREP(shape: ShapeHandle): string {
        return wrap("toBREP", () => this.#raw.toBREP(shape));
    }

    fromBREP(data: string): ShapeHandle {
        return wrap("fromBREP", () => handle(this.#raw.fromBREP(data)));
    }

    /** Serialize a shape to binary BREP (smaller/faster than the text format). */
    toBREPBinary(shape: ShapeHandle): Uint8Array {
        return wrap("toBREPBinary", () => {
            const path = this.#raw.exportBrepBinary(shape);
            const bytes = this.#module.FS.readFile(path);
            this.#module.FS.unlink(path);
            return bytes;
        });
    }

    /** Load a shape from binary BREP produced by {@link toBREPBinary}. */
    fromBREPBinary(data: Uint8Array): ShapeHandle {
        return wrap("fromBREPBinary", () => {
            const path = "/tmp/occt-import.brep.bin";
            this.#module.FS.writeFile(path, data);
            try {
                return handle(this.#raw.importBrepBinary(path));
            } finally {
                this.#module.FS.unlink(path);
            }
        });
    }

    cacheStep(stepData: string | ArrayBuffer): string {
        return wrap("cacheStep", () => {
            const shape = this.importStep(stepData);
            try {
                return this.toBREP(shape);
            } finally {
                this.release(shape);
            }
        });
    }

    loadCached(brep: string): ShapeHandle {
        return wrap("loadCached", () => this.fromBREP(brep));
    }

    // =======================================================================
    // Query / Measure
    // =======================================================================

    /**
     * Compute the axis-aligned bounding box of a shape.
     *
     * Uses `BRepBndLib::AddOptimal` for surface-precise bounds independent of
     * tessellation state. The simpler `BRepBndLib::Add` falls back to BSpline
     * pole hulls when triangulation is absent, which overshoots curved
     * geometry by ~0.27·r for arcs of radius r — that was the source of the
     * uniform 1.2 mm bounds shift versus brepjs in occt-wasm 2.0.
     *
     * @param useTriangulation - If `true`, use existing triangulation as the
     *     starting bound and refine via surface analysis (faster). If `false`,
     *     do the surface analysis from scratch (slower, but doesn't depend on
     *     prior tessellation). Both modes produce tight bounds; brepjs's
     *     `BRepBndLib.Add(shape, box, true)` corresponds to `true` here.
     */
    getBoundingBox(shape: ShapeHandle, useTriangulation: boolean): BoundingBox {
        return wrap("getBoundingBox", () => this.#raw.getBoundingBox(shape, useTriangulation));
    }

    getVolume(shape: ShapeHandle): number {
        return wrap("getVolume", () => this.#raw.getVolume(shape));
    }

    getSurfaceArea(shape: ShapeHandle): number {
        return wrap("getSurfaceArea", () => this.#raw.getSurfaceArea(shape));
    }

    getLength(shape: ShapeHandle): number {
        return wrap("getLength", () => this.#raw.getLength(shape));
    }

    getCenterOfMass(shape: ShapeHandle): Vec3 {
        return wrap("getCenterOfMass", () => {
            const v = this.#raw.getCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }

    /**
     * Matrix of inertia about the center of mass, as a row-major 3×3 array
     * (length 9). Symmetric: `[1]==[3]`, `[2]==[6]`, `[5]==[7]`.
     */
    getInertia(shape: ShapeHandle): number[] {
        return wrap("getInertia", () =>
            Array.from(this.#drainVector(this.#raw.getInertia(shape), Float64Array)),
        );
    }

    /** True if `point` lies inside (or on the boundary of) a solid. */
    containsPoint(shape: ShapeHandle, point: Vec3, tolerance = 1e-7): boolean {
        return wrap("containsPoint", () =>
            this.#raw.containsPoint(shape, point.x, point.y, point.z, tolerance),
        );
    }

    /**
     * Principal moments of inertia (I₁, I₂, I₃) and principal axes
     * (3 direction vectors). Returns [I₁,I₂,I₃, ax1, ax2, ax3] where
     * each axis is [x,y,z]. Two equal moments → symmetry about that axis.
     */
    getPrincipalProperties(shape: ShapeHandle): number[] {
        return wrap("getPrincipalProperties", () =>
            Array.from(this.#drainVector(this.#raw.getPrincipalProperties(shape), Float64Array)),
        );
    }

    /**
     * Oriented bounding box (OBB) aligned to the shape's natural axes.
     * Returns [cx,cy,cz, hx,hy,hz, ax1,ax2,ax3] where h* are half-extents
     * and each axis is [x,y,z]. Tighter than the AABB for rotated parts.
     */
    getOrientedBoundingBox(shape: ShapeHandle): number[] {
        return wrap("getOrientedBoundingBox", () =>
            Array.from(this.#drainVector(this.#raw.getOrientedBoundingBox(shape), Float64Array)),
        );
    }

    /**
     * Whether the shape's shell has any free (boundary) edges — i.e.,
     * edges referenced by only one face. A closed solid has no free edges.
     */
    hasFreeEdges(shape: ShapeHandle): boolean {
        return wrap("hasFreeEdges", () => this.#raw.hasFreeEdges(shape));
    }

    /** Number of free (boundary) edges in the shape's shell. 0 = watertight. */
    freeEdgeCount(shape: ShapeHandle): number {
        return wrap("freeEdgeCount", () => this.#raw.freeEdgeCount(shape));
    }

    /**
     * Shape contents inventory counts. Returns
     * [NbFaces, NbEdges, NbFreeFaces, NbFreeWires, NbFreeEdges,
     *  NbC0Surfaces, NbBSplSurf, NbOffsetSurf].
     */
    shapeContents(shape: ShapeHandle): number[] {
        return wrap("shapeContents", () =>
            Array.from(this.#drainVector(this.#raw.shapeContents(shape), Float64Array)),
        );
    }

    /** Check if two axes are coaxial using OCCT's gp_Ax1::IsCoaxial. */
    areAxesCoaxial(
      axis1Dir: Vec3, axis1Loc: Vec3,
      axis2Dir: Vec3, axis2Loc: Vec3,
      angTol: number, linTol: number,
    ): boolean {
        return wrap("areAxesCoaxial", () =>
            this.#raw.areAxesCoaxial(
                axis1Dir.x, axis1Dir.y, axis1Dir.z,
                axis1Loc.x, axis1Loc.y, axis1Loc.z,
                axis2Dir.x, axis2Dir.y, axis2Dir.z,
                axis2Loc.x, axis2Loc.y, axis2Loc.z,
                angTol, linTol,
            ),
        );
    }

    /**
     * Fire a ray from origin in direction and return all face intersections
     * sorted by distance. Each hit: [faceHash, distance, x, y, z, u, v].
     * Use `resolveRayHits` to map faceHash → face id.
     */
    rayIntersect(shape: ShapeHandle, origin: Vec3, direction: Vec3): number[] {
        return wrap("rayIntersect", () =>
            Array.from(
                this.#drainVector(
                    this.#raw.rayIntersect(shape, origin.x, origin.y, origin.z,
                                           direction.x, direction.y, direction.z),
                    Float64Array,
                ),
            ),
        );
    }

    /**
     * Annotate raw ray intersection results with face IDs.
     * Returns an array of { face_id, distance, point, u, v } objects
     * sorted by distance from the ray origin.
     */
    resolveRayHits(raw: number[], shape: ShapeHandle): Array<{
        face_id: string;
        distance: number;
        point: [number, number, number];
        u: number;
        v: number;
    }> {
        const stride = 7;
        const faces = this.getSubShapes(shape, 'face');
        const HASH_UPPER = 1 << 30;
        const hashToIdx = new Map<number, number>();
        for (let i = 0; i < faces.length; i++) {
            const f = faces[i];
            if (!f) continue;
            hashToIdx.set(this.#raw.hashCode(f, HASH_UPPER), i);
        }
        const hits: Array<{
            face_id: string;
            distance: number;
            point: [number, number, number];
            u: number;
            v: number;
        }> = [];
        for (let i = 0; i + stride <= raw.length; i += stride) {
            const faceHash = raw[i] ?? 0;
            const faceIdx = hashToIdx.get(faceHash);
            if (faceIdx === undefined) continue;
            hits.push({
                face_id: `face:${faceIdx}`,
                distance: raw[i + 1] ?? 0,
                point: [raw[i + 2] ?? 0, raw[i + 3] ?? 0, raw[i + 4] ?? 0],
                u: raw[i + 5] ?? 0,
                v: raw[i + 6] ?? 0,
            });
        }
        return hits;
    }

    // ── BRepGraph topology queries ────────────────────────────────

    /**
     * Build a BRepGraph from a shape in the arena. Must be called once
     * before any graph* query methods. Subsequent calls with the same shape
     * are no-ops.
     */
    graphBuild(shape: ShapeHandle): void {
        this.#raw.graphBuild(shape);
    }

    /** Map faces (indices 0..N) and edges (indices 0..M) to their parent body index. */
    graphBodyMap(): number[] {
        return this.#drainVector(this.#raw.graphBodyMap(), Int32Array);
    }

    /**
     * Adjacent faces for a face index. Returns interleaved
     * [adjFaceIdx, sharedEdgeIdx, ...] pairs. Empty if none.
     */
    graphFaceAdjacency(faceIdx: number): number[] {
        return this.#drainVector(this.#raw.graphFaceAdjacency(faceIdx), Int32Array);
    }

    /** Faces that reference an edge index. Returns list of face indices. */
    graphEdgeFaces(edgeIdx: number): number[] {
        return this.#drainVector(this.#raw.graphEdgeFaces(edgeIdx), Int32Array);
    }

    /**
     * Wire topology for a face index. Encoding:
     * [outerEdgeCount, outerEdges..., innerWireCount,
     *  innerEdgeCount1, innerEdges1..., innerEdgeCount2, innerEdges2..., ...]
     */
    graphWireTopology(faceIdx: number): number[] {
        return this.#drainVector(this.#raw.graphWireTopology(faceIdx), Int32Array);
    }

    /** Start and end vertex indices for an edge. Returns [startIdx, endIdx]. */
    graphEdgeVertices(edgeIdx: number): number[] {
        return this.#drainVector(this.#raw.graphEdgeVertices(edgeIdx), Int32Array);
    }

    /**
     * Surface (area-weighted) center of mass for a face. Equivalent to
     * `BRepGProp::SurfaceProperties(face, props).CentreOfMass()`.
     *
     * Use this for face fingerprinting and finder predicates rather than a
     * tessellation-based centroid — for non-planar faces (cylinders, holed
     * planes) the two diverge.
     */
    getSurfaceCenterOfMass(face: ShapeHandle): Vec3 {
        return wrap("getSurfaceCenterOfMass", () => {
            const v = this.#raw.getSurfaceCenterOfMass(face);
            return this.#vec3FromEmbind(v);
        });
    }

    getLinearCenterOfMass(shape: ShapeHandle): Vec3 {
        return wrap("getLinearCenterOfMass", () => {
            const v = this.#raw.getLinearCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }

    surfaceCurvature(face: ShapeHandle, u: number, v: number): CurvatureData {
        return wrap("surfaceCurvature", () =>
            this.#curvatureDataFromEmbind(this.#raw.surfaceCurvature(face, u, v)),
        );
    }

    // =======================================================================
    // Surfaces
    // =======================================================================

    vertexPosition(vertex: ShapeHandle): Vec3 {
        return wrap("vertexPosition", () => {
            const v = this.#raw.vertexPosition(vertex);
            return this.#vec3FromEmbind(v);
        });
    }

    surfaceType(face: ShapeHandle): SurfaceKind {
        return wrap("surfaceType", () => this.#raw.surfaceType(face) as SurfaceKind);
    }

    surfaceNormal(face: ShapeHandle, u: number, v: number): Vec3 {
        return wrap("surfaceNormal", () => {
            const vec = this.#raw.surfaceNormal(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }

    pointOnSurface(face: ShapeHandle, u: number, v: number): Vec3 {
        return wrap("pointOnSurface", () => {
            const vec = this.#raw.pointOnSurface(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }

    outerWire(face: ShapeHandle): ShapeHandle {
        return wrap("outerWire", () => handle(this.#raw.outerWire(face)));
    }

    uvBounds(face: ShapeHandle): UVBounds {
        return wrap("uvBounds", () =>
            this.#uvBoundsFromEmbind(this.#raw.uvBounds(face)),
        );
    }

    /** Project a 3D point onto a face, returning [u, v]. */
    uvFromPoint(face: ShapeHandle, point: Vec3): { u: number; v: number } {
        return wrap("uvFromPoint", () =>
            this.#vec2FromEmbind(this.#raw.uvFromPoint(face, point.x, point.y, point.z)),
        );
    }

    /**
     * Extract cylinder data from a cylindrical face.
     *
     * Returns `null` when the face's underlying surface is not a cylinder,
     * otherwise radius/directness plus cylinder axis data where `isDirect` mirrors
     * `gp_Cylinder::Direct()` (i.e. whether U and V form a right-handed pair).
     */
    getFaceCylinderData(face: ShapeHandle): { radius: number; isDirect: boolean; location: Vec3; direction: Vec3 } | null {
        return wrap("getFaceCylinderData", () => {
            const vec = this.#raw.getFaceCylinderData(face);
            try {
                if (vec.size() === 0) return null;
                return {
                    radius: vec.get(0),
                    isDirect: vec.get(1) !== 0,
                    location: { x: vec.get(2), y: vec.get(3), z: vec.get(4) },
                    direction: { x: vec.get(5), y: vec.get(6), z: vec.get(7) },
                };
            } finally {
                vec.delete();
            }
        });
    }

    getFaceCylinderAxis(face: ShapeHandle): { location: Vec3; direction: Vec3 } | null {
        return wrap("getFaceCylinderAxis", () => {
            const data = this.getFaceCylinderData(face);
            if (!data) return null;
            return { location: data.location, direction: data.direction };
        });
    }

    /** Project a 3D point onto a face, returning the closest point as Vec3. */
    projectPointOnFace(face: ShapeHandle, point: Vec3): Vec3 {
        return wrap("projectPointOnFace", () => {
            const vec = this.#raw.projectPointOnFace(face, point.x, point.y, point.z);
            return this.#vec3FromEmbind(vec);
        });
    }

    /** Classify a UV point relative to a face boundary. */
    classifyPointOnFace(face: ShapeHandle, u: number, v: number): PointClassification {
        return wrap("classifyPointOnFace", () =>
            asEnum<PointClassification>(
                this.#raw.classifyPointOnFace(face, u, v),
                POINT_CLASSIFICATION_VALUES,
                "point classification",
            ),
        );
    }

    /** Create a BSpline surface from a grid of control points. */
    bsplineSurface(controlPoints: Vec3[], rows: number, cols: number): ShapeHandle {
        return wrap("bsplineSurface", () => {
            const flat = this.#flattenPoints(controlPoints);
            try { return handle(this.#raw.bsplineSurface(flat, rows, cols)); }
            finally { flat.delete(); }
        });
    }

    // =======================================================================
    // Curves
    // =======================================================================

    curveType(edge: ShapeHandle): CurveKind {
        return wrap("curveType", () => this.#raw.curveType(edge) as CurveKind);
    }

    /** Return the radius of a circular edge from Geom_Circle geometry, or -1 if not a circle. */
    edgeCircleRadius(edge: ShapeHandle): number {
        return wrap("edgeCircleRadius", () => this.#raw.edgeCircleRadius(edge));
    }

    curvePointAtParam(edge: ShapeHandle, param: number): Vec3 {
        return wrap("curvePointAtParam", () => {
            const vec = this.#raw.curvePointAtParam(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }

    curveTangent(edge: ShapeHandle, param: number): Vec3 {
        return wrap("curveTangent", () => {
            const vec = this.#raw.curveTangent(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }

    /** Returns [firstParam, lastParam]. */
    curveParameters(edge: ShapeHandle): { first: number; last: number } {
        return wrap("curveParameters", () => {
            const { u: first, v: last } = this.#vec2FromEmbind(this.#raw.curveParameters(edge));
            return { first, last };
        });
    }

    curveIsClosed(edge: ShapeHandle): boolean {
        return wrap("curveIsClosed", () => this.#raw.curveIsClosed(edge));
    }

    curveIsPeriodic(edge: ShapeHandle): boolean {
        return wrap("curveIsPeriodic", () => this.#raw.curveIsPeriodic(edge));
    }

    curveLength(edge: ShapeHandle): number {
        return wrap("curveLength", () => this.#raw.curveLength(edge));
    }

    interpolatePoints(points: Vec3[], periodic = false): ShapeHandle {
        return wrap("interpolatePoints", () => {
            const flat = this.#flattenPoints(points);
            try { return handle(this.#raw.interpolatePoints(flat, periodic)); }
            finally { flat.delete(); }
        });
    }

    /**
     * Interpolate a cubic B-spline through the points with clamped start/end
     * tangent directions.
     */
    interpolatePointsWithTangents(
        points: Vec3[],
        startTangent: Vec3,
        endTangent: Vec3,
    ): ShapeHandle {
        return wrap("interpolatePointsWithTangents", () => {
            const flat = this.#flattenPoints(points);
            try {
                return handle(
                    this.#raw.interpolatePointsWithTangents(
                        flat,
                        startTangent.x, startTangent.y, startTangent.z,
                        endTangent.x, endTangent.y, endTangent.z,
                    ),
                );
            } finally {
                flat.delete();
            }
        });
    }

    /** Closest point on an edge to `point`, with the curve tangent and parameter there. */
    projectPointOnEdge(
        edge: ShapeHandle,
        point: Vec3,
    ): { point: Vec3; tangent: Vec3; parameter: number } {
        return wrap("projectPointOnEdge", () => {
            const r = this.#drainVector(
                this.#raw.projectPointOnEdge(edge, point.x, point.y, point.z),
                Float64Array,
            );
            return {
                point: { x: r[0]!, y: r[1]!, z: r[2]! },
                tangent: { x: r[3]!, y: r[4]!, z: r[5]! },
                parameter: r[6]!,
            };
        });
    }

    approximatePoints(points: Vec3[], tolerance = 1e-3): ShapeHandle {
        return wrap("approximatePoints", () => {
            const flat = this.#flattenPoints(points);
            try { return handle(this.#raw.approximatePoints(flat, tolerance)); }
            finally { flat.delete(); }
        });
    }

    getNurbsCurveData(edge: ShapeHandle): NurbsCurveData {
        return wrap("getNurbsCurveData", () => {
            const raw = this.#raw.getNurbsCurveData(edge);
            const result: NurbsCurveData = {
                degree: raw.degree,
                rational: raw.rational,
                periodic: raw.periodic,
                knots: this.#drainVector(raw.knots, Float64Array),
                multiplicities: this.#drainVector(raw.multiplicities, Int32Array),
                poles: this.#drainVector(raw.poles, Float64Array),
                weights: this.#drainVector(raw.weights, Float64Array),
            };
            return result;
        });
    }

    curveDegreeElevate(edge: ShapeHandle, elevateBy: number): ShapeHandle {
        return wrap("curveDegreeElevate", () => handle(this.#raw.curveDegreeElevate(edge, elevateBy)));
    }

    curveKnotInsert(edge: ShapeHandle, knot: number, times: number): ShapeHandle {
        return wrap("curveKnotInsert", () => handle(this.#raw.curveKnotInsert(edge, knot, times)));
    }

    curveKnotRemove(edge: ShapeHandle, knot: number, tolerance: number): ShapeHandle {
        return wrap("curveKnotRemove", () => handle(this.#raw.curveKnotRemove(edge, knot, tolerance)));
    }

    curveSplit(edge: ShapeHandle, param: number): [ShapeHandle, ShapeHandle] {
        return wrap("curveSplit", () => {
            const parts = this.#vecToHandles(this.#raw.curveSplit(edge, param));
            if (parts.length !== 2) {
                throw new Error(`curveSplit: expected 2 edges, got ${parts.length}`);
            }
            return [parts[0]!, parts[1]!];
        });
    }

    liftCurve2dToPlane(
        points2d: Array<{ x: number; y: number }>,
        planeOrigin: Vec3,
        planeZ: Vec3,
        planeX: Vec3,
    ): ShapeHandle {
        return wrap("liftCurve2dToPlane", () => {
            const flatArr = new Array<number>(points2d.length * 2);
            let j = 0;
            for (const p of points2d) {
                flatArr[j++] = p.x;
                flatArr[j++] = p.y;
            }
            return this.#withF64(flatArr, (flat) =>
                handle(this.#raw.liftCurve2dToPlane(
                    flat,
                    planeOrigin.x, planeOrigin.y, planeOrigin.z,
                    planeZ.x, planeZ.y, planeZ.z,
                    planeX.x, planeX.y, planeX.z,
                )),
            );
        });
    }

    // =======================================================================
    // Healing / Repair
    // =======================================================================

    fixShape(shape: ShapeHandle): ShapeHandle {
        return wrap("fixShape", () => handle(this.#raw.fixShape(shape)));
    }

    unifySameDomain(shape: ShapeHandle): ShapeHandle {
        return wrap("unifySameDomain", () => handle(this.#raw.unifySameDomain(shape)));
    }

    isValid(shape: ShapeHandle): boolean {
        return wrap("isValid", () => this.#raw.isValid(shape));
    }

    healSolid(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healSolid", () => handle(this.#raw.healSolid(shape, tolerance)));
    }

    healFace(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healFace", () => handle(this.#raw.healFace(shape, tolerance)));
    }

    healWire(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healWire", () => handle(this.#raw.healWire(shape, tolerance)));
    }

    fixFaceOrientations(shape: ShapeHandle): ShapeHandle {
        return wrap("fixFaceOrientations", () => handle(this.#raw.fixFaceOrientations(shape)));
    }

    removeDegenerateEdges(shape: ShapeHandle): ShapeHandle {
        return wrap("removeDegenerateEdges", () => handle(this.#raw.removeDegenerateEdges(shape)));
    }

    buildCurves3d(wire: ShapeHandle): void {
        wrap("buildCurves3d", () => this.#raw.buildCurves3d(wire));
    }

    fixWireOnFace(wire: ShapeHandle, face: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("fixWireOnFace", () => handle(this.#raw.fixWireOnFace(wire, face, tolerance)));
    }

    // =======================================================================
    // Memory
    // =======================================================================

    release(shape: ShapeHandle): void {
        this.#raw.release(shape);
    }

    releaseAll(): void {
        this.#raw.releaseAll();
    }

    get shapeCount(): number {
        return this.#raw.getShapeCount();
    }

    // =======================================================================
    // Debugging
    // =======================================================================

    /** Return a human-readable summary of a shape for debugging. */
    describe(shape: ShapeHandle): string {
        const type = this.getShapeType(shape);
        const bbox = this.getBoundingBox(shape, true);
        const dims = `[${(bbox.xmax - bbox.xmin).toFixed(2)} x ${(bbox.ymax - bbox.ymin).toFixed(2)} x ${(bbox.zmax - bbox.zmin).toFixed(2)}]`;
        const parts: string[] = [`${type} ${dims}`];

        if (type === "solid" || type === "compound" || type === "compsolid") {
            parts.push(`vol=${this.getVolume(shape).toFixed(3)}`);
            parts.push(`area=${this.getSurfaceArea(shape).toFixed(3)}`);
        }

        const faces = this.getSubShapes(shape, "face");
        const edges = this.getSubShapes(shape, "edge");
        const verts = this.getSubShapes(shape, "vertex");
        parts.push(`F:${faces.length} E:${edges.length} V:${verts.length}`);

        return parts.join(" | ");
    }

    [Symbol.dispose](): void {
        kernelRegistry.unregister(this);
        try {
            this.#raw.releaseAll();
            this.#raw.delete();
        } catch {
            // Raw kernel was already deleted externally (e.g. by an adapter
            // following Embind teardown conventions) — ignore, matching the
            // FinalizationRegistry callback's behavior.
        }
    }

    // =======================================================================
    // Raw module / kernel access (for third-party adapters)
    // =======================================================================

    /**
     * Return the underlying Emscripten module. Intended for integrators who
     * need to hand the raw module to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`) without bypassing {@link OcctKernel.init}.
     *
     * The module is owned by this `OcctKernel` instance — disposing the
     * kernel does not invalidate the module reference, but the raw kernel
     * obtained via {@link getRawKernel} *will* be deleted.
     */
    getRawModule(): OcctWasmModule {
        return this.#module;
    }

    /**
     * Return the underlying raw Embind kernel. Intended for integrators who
     * need to hand the raw kernel to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`).
     *
     * Lifecycle: the raw kernel is owned by this `OcctKernel`. Calling
     * `kernel[Symbol.dispose]()` (or letting the FinalizationRegistry collect
     * the wrapper) will `releaseAll()` and `delete()` the raw kernel — so the
     * adapter must not outlive the `OcctKernel` it was constructed from.
     * Do not call `delete()` or `releaseAll()` on the raw kernel directly.
     */
    getRawKernel(): OcctRawKernel {
        return this.#raw;
    }

    // =======================================================================
    // Private helpers
    // =======================================================================

    // Per-element push_back()/get() each cross the JS->WASM boundary. Below this
    // element count the per-element loop still beats the bulk HEAP-copy path (a
    // malloc round-trip on the way in, a typed-array view + copy on the way out);
    // above it, the single bulk copy wins (measured ~50% of cost on point methods).
    static readonly #BULK_THRESHOLD = 64;

    #makeVector<T extends { push_back(v: number): void }>(
        ctor: new () => T,
        values: number[] | ShapeHandle[],
    ): T {
        const vec = new ctor();
        for (const v of values) {
            vec.push_back(v);
        }
        return vec;
    }

    // Copy an array into WASM memory in one shot, then build the vector C++-side.
    // allocBytes() may grow the heap, so the backing buffer is read after it; a
    // fresh typed-array view is layered over it at the malloc'd (aligned) offset.
    #bulkF64(values: ArrayLike<number>): EmbindVectorF64 {
        const ptr = this.#raw.allocBytes(values.length * 8);
        new Float64Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorF64FromHeap(ptr, values.length);
        } finally {
            this.#raw.freeBytes(ptr);
        }
    }

    #bulkU32(values: ArrayLike<number>): EmbindVectorU32 {
        const ptr = this.#raw.allocBytes(values.length * 4);
        new Uint32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorU32FromHeap(ptr, values.length);
        } finally {
            this.#raw.freeBytes(ptr);
        }
    }

    #bulkI32(values: ArrayLike<number>): EmbindVectorI32 {
        const ptr = this.#raw.allocBytes(values.length * 4);
        new Int32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorI32FromHeap(ptr, values.length);
        } finally {
            this.#raw.freeBytes(ptr);
        }
    }

    // Reverse of the #bulk* helpers: read a returned vector into a JS array.
    // Each get() is a JS->WASM crossing, so above the threshold we fetch the
    // vector's contiguous storage pointer once and copy the whole block in one
    // shot (2 crossings total, regardless of length). heap.slice() detaches a
    // copy of those WASM bytes before the typed-array view is built, so the
    // caller can free the vector afterward with no aliasing concern.
    #readVector(
        vec: EmbindVectorF64 | EmbindVectorI32 | EmbindVectorU32,
        HeapArray: Float64ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor,
        count: number,
    ): number[] {
        if (count < OcctKernel.#BULK_THRESHOLD) {
            const out = new Array<number>(count);
            for (let i = 0; i < count; i++) {
                out[i] = vec.get(i);
            }
            return out;
        }
        const ptr = vec.dataPtr();
        const heap = this.#module.HEAPU32.buffer as ArrayBuffer;
        const buffer = heap.slice(ptr, ptr + count * HeapArray.BYTES_PER_ELEMENT);
        return Array.from(new HeapArray(buffer));
    }

    // Read a vector to numbers, then delete it. Every call site reads-then-frees.
    #drainVector(
        vec: EmbindVectorF64 | EmbindVectorI32,
        HeapArray: Float64ArrayConstructor | Int32ArrayConstructor,
    ): number[] {
        try {
            return this.#readVector(vec, HeapArray, vec.size());
        } finally {
            vec.delete();
        }
    }

    #vecToHandles(vec: EmbindVectorU32): ShapeHandle[] {
        try {
            return this.#readVector(vec, Uint32Array, vec.size()).map((id) => handle(id));
        } finally {
            vec.delete();
        }
    }

    #makeVectorU32(ids: ShapeHandle[] | number[]): EmbindVectorU32 {
        if (ids.length < OcctKernel.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorUint32, ids);
        }
        return this.#bulkU32(ids as number[]);
    }

    #makeVectorF64(values: number[]): EmbindVectorF64 {
        if (values.length < OcctKernel.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorDouble, values);
        }
        return this.#bulkF64(values);
    }

    #makeVectorI32(values: number[]): EmbindVectorI32 {
        if (values.length < OcctKernel.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorInt, values);
        }
        return this.#bulkI32(values);
    }

    // Scope guards: build a vector, run `fn` with it, and always delete it.
    // Replaces the make/try/finally/delete boilerplate at every vector-arg call
    // site so the cleanup can't be forgotten or mis-copied.
    #withU32<R>(ids: ShapeHandle[] | number[], fn: (vec: EmbindVectorU32) => R): R {
        const vec = this.#makeVectorU32(ids);
        try {
            return fn(vec);
        } finally {
            vec.delete();
        }
    }

    #withF64<R>(values: number[], fn: (vec: EmbindVectorF64) => R): R {
        const vec = this.#makeVectorF64(values);
        try {
            return fn(vec);
        } finally {
            vec.delete();
        }
    }

    #withI32<R>(values: number[], fn: (vec: EmbindVectorI32) => R): R {
        const vec = this.#makeVectorI32(values);
        try {
            return fn(vec);
        } finally {
            vec.delete();
        }
    }

    #flattenPoints(points: Vec3[]): EmbindVectorF64 {
        if (points.length * 3 < OcctKernel.#BULK_THRESHOLD) {
            const vec = new this.#module.VectorDouble();
            for (const p of points) {
                vec.push_back(p.x);
                vec.push_back(p.y);
                vec.push_back(p.z);
            }
            return vec;
        }
        const flat = new Float64Array(points.length * 3);
        let j = 0;
        for (const p of points) {
            flat[j++] = p.x;
            flat[j++] = p.y;
            flat[j++] = p.z;
        }
        return this.#bulkF64(flat);
    }

    #vec2FromEmbind(vec: EmbindVectorF64): { u: number; v: number } {
        const u = vec.get(0);
        const v = vec.get(1);
        vec.delete();
        return { u, v };
    }

    #uvBoundsFromEmbind(vec: EmbindVectorF64): UVBounds {
        const result: UVBounds = {
            uMin: vec.get(0),
            uMax: vec.get(1),
            vMin: vec.get(2),
            vMax: vec.get(3),
        };
        vec.delete();
        return result;
    }

    #curvatureDataFromEmbind(vec: EmbindVectorF64): CurvatureData {
        const result: CurvatureData = {
            min: vec.get(0),
            max: vec.get(1),
            gaussian: vec.get(2),
            mean: vec.get(3),
        };
        vec.delete();
        return result;
    }

    #vec3FromEmbind(vec: EmbindVectorF64): Vec3 {
        const x = vec.get(0);
        const y = vec.get(1);
        const z = vec.get(2);
        vec.delete();
        return { x, y, z };
    }

    #extractMesh(raw: RawMeshData): Mesh {
        try {
            return this.#extractMeshFromRaw(raw);
        } finally {
            raw.delete();
        }
    }

    #extractMeshFromRaw(raw: RawMeshData): Mesh {
        const vertexCount = raw.positionCount / 3;
        const triangleCount = raw.indexCount / 3;
        const positions = new Float32Array(
            this.#module.HEAPF32.buffer.slice(
                raw.getPositionsPtr(),
                raw.getPositionsPtr() + raw.positionCount * 4,
            ),
        );
        const normals = new Float32Array(
            this.#module.HEAPF32.buffer.slice(
                raw.getNormalsPtr(),
                raw.getNormalsPtr() + raw.normalCount * 4,
            ),
        );
        const indices = new Uint32Array(
            this.#module.HEAPU32.buffer.slice(
                raw.getIndicesPtr(),
                raw.getIndicesPtr() + raw.indexCount * 4,
            ),
        );
        return { positions, normals, indices, vertexCount, triangleCount };
    }

    #extractMeshWithFaceGroups(raw: RawMeshData): Mesh {
        try {
            const mesh = this.#extractMeshFromRaw(raw);
            if (raw.faceGroupCount > 0) {
                mesh.faceGroups = new Int32Array(
                    this.#module.HEAP32.buffer.slice(
                        raw.getFaceGroupsPtr(),
                        raw.getFaceGroupsPtr() + raw.faceGroupCount * 4,
                    ),
                );
                mesh.faceCount = raw.faceGroupCount / 3;
            }
            return mesh;
        } finally {
            raw.delete();
        }
    }
}
