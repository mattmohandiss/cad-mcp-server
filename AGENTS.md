## Goal
Build a custom read-only OCCT wasm kernel (~13 toolkits, 121 facade methods) for an MCP server that returns raw geometric facts; all inference falls on the LLM.

## Constraints & Preferences
- MCP tools deal only in geometric facts (surface type, area, length, normal, curvature, adjacency, PMI values).
- All inference and analysis falls on the LLM — no composite analysis tools, no domain-specific scoring.
- Stripped wasm first; engineer features (draft angle, wall thickness) built on existing raw-fact tools.
- Final UI undecided (MCP server keeps options open).
- NixOS host, podman (rootless) replaces Docker, no `cargo` in default environment.
- `kernel/` is a git submodule (occt-wasm fork) — modifications must be committed there to persist.
- Build cache can cause stale facade layers; `--no-cache` or `podman run -v` with mounted facade dir forces fresh C++ compilation.

## Progress
### Done
- Architecture rules documented in plan file (2 non-negotiable rules).
- Surveyed 14 categories of engineer questions (~100+ use-cases); all answerable by composing the existing 6 MCP tools + 13 kept OCCT toolkits.
- Created `kernel/Dockerfile.builder` — builds OCCT with only 13 toolkits via `BUILD_ADDITIONAL_TOOLKITS`.
- Updated `kernel/Dockerfile` FROM: `ghcr.io/andymai/occt-wasm-builder` → `localhost/occt-wasm-builder`.
- Updated `kernel/xtask/src/build.rs`:
  - CMake flags: all `BUILD_MODULE_*=FALSE`, `BUILD_ADDITIONAL_TOOLKITS` with 13 toolkits, `USE_RAPIDJSON=OFF`.
  - `EXCLUDED_LIBS` expanded from 14 → 36 entries (all dropped toolkits).
  - Fixed Rust `cmd!` semicolon escaping by using a `let toolkits = "TKernel;TKMath;..."` variable.
- Stripped `kernel/facade/include/occt_kernel.h`:
  - Removed XCAF includes, structs (`EvolutionData`, `ProjectionData`, `XCAFLabelInfo`).
  - Removed all dropped method declarations: primitives, booleans, modeling, sweeps, helix, patterns, batch ops, modifiers, evolution, XCAF, HLR, extrusion law.
  - Removed private members (`normalizeSolidOrientation`, `XCAFDocRecord`, `xcafDocs_`, `nextXcafId_`).
- Stripped `kernel/facade/src/kernel.cpp`: removed XCAF includes/helpers, `normalizeSolidOrientation`.
- Stripped `kernel/xtask/src/codegen/config.rs`: removed 68 method specs. 5155 → ~3130 lines, 121 methods.
- Regenerated generated C++ with `cargo xtask codegen` — 121 methods.
- Stripped `kernel/ts/src/raw-types.ts`: removed `EmscriptenFS` import, dropped structs/interfaces, removed all dropped method declarations from `OcctRawKernel` interface (kept only 121 methods).
- Stripped `kernel/ts/src/types.ts`: removed XCAF types (`Color3`, `LabelTag`, `Location`, `AddShapeOptions`, `AddChildOptions`, `LabelInfo`, `GLTFExportOptions`), removed `TransitionMode`/`SweepMode`/`JoinType`/`BooleanOp` enums, removed `EvolutionData`/`ProjectionData` interfaces, cleaned up error classifier sets.
- Stripped `kernel/ts/src/index.ts`:
  - Removed all dropped method wrappers (primitives, booleans, modeling, sweeps, helix, patterns, composeTransform, translateBatch, booleanPipeline, filletBatch, projectEdges, toSVG, toMultiviewSVG, thicken, defeature, simplify, filletVariable, offsetWire2D, all evolution, all extrusion law, createXCAFDocument, importXCAFFromSTEP).
  - Removed XCAF/SVG imports and re-exports.
  - Removed `#extractEvolution` helper.
  - Removed unused types from imports.
- Deleted `kernel/ts/src/xcaf-document.ts`.
- Deleted `kernel/ts/src/svg.ts` (HLR rendering, unused after removing projectEdges).
- Updated `kernel/ts/src/raw-types.ts`: added `EmscriptenFS` interface and `FS` property back to `OcctWasmModule` (needed by `toBREPBinary`/`fromBREPBinary`).
- Updated `src/tests/fixtures.ts`: simplified to only export NIST file path.
- Updated `src/tests/integration.test.ts`: replaced kernel-generated fixtures with NIST sample file, made assertions flexible (NIST-agnostic). All 8 tests pass.
- TypeScript `tsc --noEmit` compiles clean.

### Blocked (in order of dependency)
1. Builder Docker image not yet built (30-45 min podman build on first run).
2. Wasm rebuild: `podman build --no-cache -t occt-wasm .` — cannot proceed until builder image exists.
3. Tests are already updated and pass with the NIST sample file, but rebuilding the wasm will validate the config.rs stripping actually links.

## Key Decisions
- **MCP tools return raw geometric facts only.** No feature recognition, no manufacturability scoring, no classification. LLM composes primitive tool calls to answer engineer questions. Confirmed by user.
- **121 kept facade methods** (was ~195). All remaining methods depend only on the 13 kept OCCT toolkits. Verified via codegen.
- **13 kept toolkits** are sufficient for all engineer analysis use-cases surveyed.
- **Stripped build is purely a wasm-size & build-speed optimization.** It does not change MCP server functionality.
- **Dockerfile.builder** creates the OCCT static libs (13 toolkits). Main Dockerfile builds facade + wasm. Both owned in-repo.
- **`BUILD_ADDITIONAL_TOOLKITS`** with 13 toolkit names replaces all `BUILD_MODULE_*=TRUE`. CMake auto-resolves transitive dependencies.

## Next Steps
1. Build the custom builder Docker image: `podman build -t localhost/occt-wasm-builder -f kernel/Dockerfile.builder kernel/`
2. Rebuild wasm: `podman build --no-cache -t occt-wasm kernel/`
3. Verify all 8 integration tests still pass with rebuilt wasm.
4. Optionally: strip `kernel/ts/src/worker.ts` (Web Worker proxy — references dropped methods but is a separate entry point, not part of main package).

## Critical Context
- Codegen succeeded with 121 methods. Categories: construction (25), curve (17), healing (10), io (8), kernel (4), marshal (5), query (23), tessellate (5), topology (13), transforms (11).
- The `cmd!` macro in build.rs uses Rust variables for CMake toolkit flags because `\;` is not a valid Rust escape.
- `EXCLUDED_LIBS` in build.rs has 36 entries. Must not exclude `libTKXSBase.a` (needed by TKDESTEP).
- `.gitignore` in kernel submodule excludes `facade/generated/`, `dist/`, `*.wasm`, `occt/build/`, `target/`, `3rdparty/`. Generated files are force-tracked.
- Cargo is available via `export PATH="$HOME/.cargo/bin:$PATH"` (rustup was already installed).

## Relevant Files
- `kernel/Dockerfile.builder`: fresh — 13 toolkit OCCT build.
- `kernel/Dockerfile`: FROM → `localhost/occt-wasm-builder`.
- `kernel/xtask/src/build.rs`: CMake flags stripped, EXCLUDED_LIBS expanded, toolkit variable fix.
- `kernel/facade/include/occt_kernel.h`: stripped — no XCAF, no primitives/booleans/modeling/sweep/evolution/HLR/XCAF declarations.
- `kernel/facade/src/kernel.cpp`: stripped — no XCAF helpers, no normalizeSolidOrientation.
- `kernel/xtask/src/codegen/config.rs`: 3130 lines, 121 method specs (was 5155 lines, ~195 specs).
- `kernel/facade/generated/kernel.cpp`: regenerated — 121 methods.
- `kernel/facade/generated/bindings.cpp`: regenerated — 121 embind bindings.
- `kernel/ts/src/raw-types.ts`: cleaned — 121 method declarations, EmscriptenFS added.
- `kernel/ts/src/types.ts`: cleaned — XCAF/enums/EvolutionData/ProjectionData removed.
- `kernel/ts/src/index.ts`: cleaned — only 121 kept methods, no XCAF/SVG imports.
- `kernel/ts/src/xcaf-document.ts`: **deleted**.
- `kernel/ts/src/svg.ts`: **deleted**.
- `src/tests/fixtures.ts`: simplified — NIST file path only.
- `src/tests/integration.test.ts`: updated — all 8 tests pass with NIST sample file.
