# Sidecar tool/backend contract

Status: sidecar implementation is integrated on the Linux validation path. All eight measure kinds dispatch to the sidecar; native STEP integration checks cover each non-distance kind. Viewer CVM1 chunks and geometry-plus-STEP-metadata diff use the new path. A repeated-instance XCAF fixture verifies distinct occurrence IDs, transformed extents, and scoped distance. The legacy WASM/kernel stack is removed. PR CI builds the native sidecar and runs fixture-backed integration tests; release CI smoke-tests a packed MCP tool call. Broader geometry parity, limits/error/restart coverage, and benchmarking remain follow-up work. Cross-platform validation is deferred; package support is restricted to validated Linux x64 pending platform CI. Preserve the four public tools and host/client visualization.

## Boundary rules

- MCP sends one bounded, typed operation per tool call; the sidecar batches all OCCT work for that call. Never issue one IPC request per face, edge, point, or ray.
- STEP geometry, XCAF documents, and OCCT handles stay inside the sidecar. Return compact JSON facts and stable entity IDs, not kernel pointers or whole B-reps.
- `include`, `detail`, selected fields, pagination, and measurement kind are execution hints: compute only requested facts. Apply filters, sorting, grouping, and pagination before returning data.
- Validate limits in both TypeScript and C++. Bound result count, distance-pair count, point count, ray-grid density, and operation timeout.
- Keep units, coordinate conventions, entity numbering, and error categories explicit and stable. Sidecar model handles are process-local and invalid after restart/timeout.
- Internal IPC uses OCS1 frames: 16-byte header (magic, kind, zeroed flags, uint32 request ID, uint32 payload length; little-endian) followed by JSON or raw binary. Cap JSON at 16 MiB and binary at 64 MiB; stderr is diagnostics only. TypeScript protocol tests, native C++ build, and Linux binary smoke checks pass. Other platforms are not yet validated.

## Tool mapping

| Public tool     | Schema intent                                                                             | Proposed sidecar operation                           | OCCT work / contract gaps                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect`       | File path + sections (`size`, `counts`, `health`)                                         | Sidecar `inspect(modelId)`                           | Returns bounds, volume, area, topology counts, validity, and XCAF occurrence IDs. Per-body/quality/inertia/topology sections remain gaps.                          |
| `find_entities` | Face/edge/vertex/solid-body, optional `component_name`, filters, entity IDs, limit/offset | Sidecar `findEntities(modelId, ...)`                 | Whole-model IDs and initial XCAF leaf-occurrence-scoped IDs; repeated-instance behavior requires a true multi-instance fixture. Filters and pagination run in C++. |
| `measure`       | One of distance, thickness, draft, ray, ray-grid, point-analysis, section, continuity     | Sidecar `measureGeometry` / `measureEntityDistances` | All eight kinds dispatch in-process with bounded entity/point/ray counts. Geometry parity still needs broader fixture coverage. Keep one public tool.              |
| `diff`          | Two STEP paths                                                                            | Sequential sidecar inspection + STEP metadata parser | Geometry deltas plus parsed STEP schema/product/authoring facts. Semantic parsing uses the lightweight text parser; it does not make design-intent claims.         |

## LLM/schema guidance

- Keep four high-level engineering tools; do not expose raw OCCT method names or arbitrary kernel commands.
- Make legal argument combinations obvious in JSON Schema: face-vs-edge filters and kind-specific measure requirements. Keep descriptive units and examples; reject irrelevant fields instead of silently ignoring them.
- Preserve simple defaults and bounded result pages. Let the model request richer details explicitly.
- Internal sidecar operation names/types are not MCP API and may evolve independently.

## Visualization capability (in scope)

The current viewer API is a companion HTTP service bound to 127.0.0.1 and bearer-token protected, not one of the four LLM tools. A host opens a model, then fetches a manifest, entity metadata, and per-body mesh chunks encoded as binary positions/normals/indices plus triangle-to-face mapping. This is how a capable host/viewer can render geometry; an LLM tool response should not carry giant mesh arrays. Preserve the visualization capability, but review whether HTTP remains the right host integration. The sidecar must return actual mesh data (prefer bounded binary chunks); the prototype's triangle-count-only `mesh` operation is insufficient.

Keep the existing localhost HTTP artifact API as the first host integration; route its binary chunk request through an OCS1 binary frame carrying the existing CVM1 chunk. This avoids base64 and temporary files. Linux native framing and viewer chunks are smoke-tested; cross-platform validation is deferred by decision.

## Native build and compiler cache

The Nix dev shell provides the native compiler, CMake, Ninja, and ccache. Build from `occt/sidecar` with a persistent work directory and build directory:

```sh
cd occt/sidecar
CCACHE_DIR="$HOME/.cache/cad-mcp-server/ccache" nix develop --command \
  python3 scripts/build.py native --jobs 8 --work build-work --build-dir build-work/native
```

The first build compiles the pinned OCCT dependency set; later builds in the same build directory are incremental. ccache can reuse matching compiler outputs across fresh build directories/worktrees when compiler version, flags, and source inputs match. CMake build directories themselves contain absolute source paths and must be reconfigured when moved; keep the source/build paths stable for fastest rebuilds. Fully static glibc linking is optional (`--also-static`) and may require static system libraries not provided by the Nix dev shell. `build-work/` is generated and must not be committed.

## Acceptance gates

1. Contract tests for names, schemas, result shapes, stable IDs, units, and errors.
2. Golden-file parity on `The Cell.step`, a small part, and an assembly, including repeated component instances.
3. Exercise bounds/limits, Unicode and missing paths, cancellation, restart, and repeated opens/closes.
4. Benchmark equivalent requests with cold/warm runs and report latency plus peak/retained memory.
5. Validate the native Linux sidecar and viewer path. Cross-platform build/runtime checks are deferred and are not a completion gate for this migration phase.

The repeated-instance fixture is generated by the excluded CMake target `generate-repeated-assembly-fixture` under `occt/sidecar/tests/`; the checked-in STEP output is `src/tests/fixtures/repeated-instances.step`.
