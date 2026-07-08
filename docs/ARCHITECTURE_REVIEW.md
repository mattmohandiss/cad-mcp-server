# Architecture Review

Date: 2026-07-08

> Historical note: this review was written before the public-contract refactor that added
> `src/public-contract.ts`, tightened `select`/`order_by` validation, aligned README/server
> metadata, and generated query-help field lists from shared constants. Treat the findings below as
> historical context unless they are revalidated against current code.

## Executive Summary

The server has a clear and mostly healthy architecture: a small MCP tool surface in `src/index.ts`, thin tool adapters in `src/tools/`, cached model access through `src/model-store.ts`, query and measurement services in `src/query/`, and an OCCT WASM facade under `occt/`. This matches the product rule that the server returns measured CAD facts while the LLM performs interpretation.

The main risks are not broad structural problems. They are concentrated at contract boundaries: tool response wrapping, schema/docs drift, loose field validation, and implicit mutable state in the singleton kernel. The highest-priority fixes are small and should be addressed before adding more tool surface.

## Runtime Flow

```text
MCP client
  -> src/index.ts registerTool callback
  -> Zod input schema parse
  -> src/tools/* adapter
  -> src/query/* service or inspect/diff service
  -> src/model-store.ts cached LoadedStepModel
  -> occt-wasm singleton kernel and STEP/PMI parsers
  -> wrapTool response envelope
  -> jsonToolResult MCP content and structuredContent
```

## Findings

### High: `inspect_step` Likely Returns A Nested Success Envelope

Evidence: `src/tools/inspect.ts:21-22` wraps `handleInspectStepFile(...)` with `wrapTool`, while `src/tools/step-tools.ts:8-10` also wraps its implementation with `wrapTool`. `src/index.ts:139-142` passes the returned value through `jsonToolResult`, which unwraps only one envelope at `src/index.ts:42-49`.

Impact: Successful `inspect_step` calls can expose `{ ok: true, data: ... }` inside `structuredContent` instead of returning the inspect payload directly. This makes `inspect_step` inconsistent with the other public tools and can confuse clients or evals that consume structured output.

Recommendation: Keep exactly one envelope boundary. The smallest fix is to remove the outer `wrapTool` from `handleInspectStep` or make `handleInspectStepFile` return raw inspect data and let the adapter wrap it. Add a regression test that calls `handleInspectStep` and verifies `jsonToolResult(...).structuredContent` has `file_path`, not `ok`.

### High: Singleton Kernel Graph State Is Implicit And Request-Global

Evidence: `src/kernel/kernel.ts:3-8` creates a single `OcctKernel` instance for the process. The C++ facade stores one `graph_` and `graphShape_`; `ensureGraph` replaces them when a different shape is passed at `occt/facade/src/kernel.cpp:339-349`. Graph reads such as `graphFaceAdjacency` and `graphEdgeFaces` only check that some graph exists at `occt/facade/src/kernel.cpp:396-421`, not that it still belongs to the current model.

Impact: Concurrent or interleaved operations over different models can rebuild the process-global graph between `graphBuild` and graph read calls. JavaScript execution is single-threaded, but async request interleaving still exists around awaited operations. A wrong graph would produce incorrect adjacency, body maps, free-edge analysis, or continuity results without necessarily throwing.

Recommendation: Make graph ownership explicit. Options include per-model kernel instances, graph APIs that take the shape and call `ensureGraph(shape)` internally for every read, or a serialized kernel/graph critical section around graph-dependent operations. The safest minimal change is to modify facade graph read methods to accept the root shape handle and ensure the graph for that shape before reading.

### Medium: Temporary Shape Handles Have No Clear Lifetime Policy

Evidence: `LoadedStepModel.dispose` releases only the root imported shape at `src/model-store.ts:125-133`. The facade returns additional handles from calls such as `getSubShapes` at `occt/ts/src/index.ts:712-717` and `sectionByPlane` at `occt/ts/src/index.ts:1184-1190`. `release` and `releaseAll` exist at `occt/ts/src/index.ts:1549-1555`, but query and measurement paths generally do not release subshape or section handles.

Impact: A long-lived process can accumulate arena handles during repeated queries, ray/section measurement, and entity extraction. This is especially risky because the server intentionally caches models and keeps a singleton kernel alive.

Recommendation: Document and enforce handle ownership. If `getSubShapes` returns non-owning handles, encode that in the facade docs and tests. If they are owning handles, add scoped disposal helpers around section results and repeated subshape traversals, or cache/release them as part of `LoadedStepModel` disposal.

### Medium: Public Query Fields Are Loosely Validated And Silently Ignored

Evidence: `query_faces.select` and `query_edges.select` accept arbitrary strings at `src/schemas/tool-schemas.ts:181-188` and `src/schemas/tool-schemas.ts:262-269`. `order_by.by` is also a plain string at `src/schemas/tool-schemas.ts:190-198` and `src/schemas/tool-schemas.ts:271-279`. Unknown face projection fields fall through with no error in `src/query/faces.ts:436-509`; unknown sort fields leave `cmp = 0` at `src/query/faces.ts:331-363`.

Impact: Typos from an LLM or client can produce successful but incomplete or unsorted responses. This weakens the MCP contract and makes failures hard to diagnose.

Recommendation: Replace loose strings with enums for supported `select` fields and `order_by.by` fields. If the field list must stay extensible, reject unknown values in the adapter and return a clear invalid-input error listing supported values.

### Medium: Architecture Docs, Tests, Registry Metadata, And README Have Drifted

Evidence: `docs/ARCHITECTURE.md:39` says `measure_step` has 7 ops, while `src/schemas/tool-schemas.ts:70-84` exposes 13. `src/tests/four-tool-surface.test.ts:16-18` has a test title saying 7 ops but asserts 13. `package.json:3` is version `0.4.4`, while `server.json:12-17` is `0.4.2`. `README.md:60-63` says Node.js `22+`, while `package.json:29-31` requires `>=24` and CI uses Node 24.

Impact: Users, registry consumers, and maintainers see conflicting contracts. The release workflow syncs `server.json` only after release creation at `.github/workflows/release-please.yml:37-48`, so the checked-in metadata can remain stale between releases.

Recommendation: Update docs and tests to the current 13-op tool surface. Decide whether registry metadata should be kept synced in normal PRs or only during release publication. Align README requirements with the package engine.

### Medium: Query Help Advertises At Least One Field That Projection Does Not Return

Evidence: `src/resources/query-help.ts:63-78` lists face `select_fields`, including `tolerance`. `projectFace` handles `uv_bounds` and `is_valid` but has no `tolerance` case in `src/query/faces.ts:436-509`.

Impact: The LLM-facing resource can instruct clients to request a field that is silently omitted. This compounds the loose field validation problem.

Recommendation: Generate query help field lists from the same constants used by schemas/projection, or add contract tests that every advertised select field is accepted and returned when present on the entity.

### Medium: MCP Output Contracts Are Implicit

Evidence: The `RegisterTool` type allows `outputSchema` at `src/index.ts:68-81`, but tool registrations at `src/index.ts:130-219` only provide input schemas and annotations.

Impact: MCP clients get strong input validation but no machine-readable output contract. This makes future refactors more likely to introduce response drift, especially for large nested outputs like `inspect_step` and `measure_step`.

Recommendation: Add output schemas for stable top-level envelopes first, then expand to detailed per-tool output schemas where practical. At minimum, add tests that assert top-level structured content shapes for all five tools.

### Medium: Expensive Measurement And Query Paths Need Explicit Cost Controls

Evidence: `buildClosestFaceDistances` does page-by-all-faces distance calls at `src/query/faces.ts:182-216`. `buildFaceAdjacencies` calls `kernel.getSubShapes(shape, 'edge')` inside the adjacency loop at `src/query/faces.ts:140-174`. `runRayTestGrid` allows up to 10,000 rays per entity at `src/query/measure.ts:369-481`, and `measure_step.entity_ids` allows up to 500 entities at `src/schemas/tool-schemas.ts:308-314`.

Impact: A valid request can trigger millions of kernel operations. This is acceptable for local CAD inspection only if costs are predictable and visible to clients.

Recommendation: Add cost accounting and guardrails for high-cost combinations. Examples: lower caps for grid rays across batched entities, return estimated or actual operation counts, reject `closest_face_distance` above a face-count threshold unless explicitly requested, and precompute edge subshapes once per adjacency build.

### Low: Public Read-Only Boundary Depends On Discipline, Not Type Separation

Evidence: The MCP surface is read-only and annotated as such at `src/index.ts:120-124`, but `occt/ts/src/index.ts` exposes many construction and modification methods such as `makeBox`, `translate`, `sew`, and `removeHolesFromFace`.

Impact: Current server code does not expose mutation, so this is not an immediate product violation. The risk is accidental future exposure because the internal facade type mixes read and write capabilities.

Recommendation: Introduce a narrow read-only kernel interface for server code or lint/review rules that prevent MCP tools from importing construction/export APIs. Keep editing-capable facade methods available only to tests or future non-MCP packages.

### Low: Test Coverage Is Skewed Toward Schemas And Pure Query Helpers

Evidence: Schema tests cover the public tool list in `src/tests/four-tool-surface.test.ts`. Result formatting is covered in `src/tests/mcp-result.test.ts`. The only direct missing-file integration path is `src/tests/integration.test.ts`. Kernel-heavy coverage is guarded by WASM availability in `src/tests/ground-truth-verification.test.ts` and `src/tests/wasm-guard.ts`.

Impact: The highest-risk behaviors are under-tested: real MCP tool invocation, output shapes, response envelope consistency, graph-dependent adjacency, section/curvature/continuity measurements, and package smoke behavior.

Recommendation: Add a small end-to-end MCP client test for registered tools and top-level structured output. Add focused WASM tests for representative measurement ops when the kernel is available. Add non-WASM unit tests for envelope handling and schema/help drift.

## Recommended Remediation Sequence

1. Fix the `inspect_step` double-wrap and add a regression test.
2. Align docs, test names, README Node requirement, and `server.json` version policy.
3. Add enums or explicit validation for `select` and `order_by.by`; fix query-help drift.
4. Add top-level output shape tests for all five tools.
5. Make kernel graph ownership explicit before relying further on adjacency-heavy features.
6. Define shape handle ownership and disposal policy, then patch leaks or document non-owning handles.
7. Add cost limits and reporting for expensive query and measurement combinations.
8. Consider a read-only kernel interface to protect the MCP product boundary.

## Residual Risks And Open Questions

The graph-state risk needs a targeted concurrent-request reproduction or facade-level test to confirm whether it can produce wrong results in practice. The handle-lifetime risk depends on whether the C++ arena treats subshape IDs as owned handles or stable references. The version drift may be acceptable if the registry manifest is intentionally synced only at release time, but that policy should be documented so maintainers do not treat it as accidental breakage.

## Validation Notes

This review adds documentation only. Relevant validation is formatting for Markdown and, if follow-up code changes are made, `just check`. Kernel-boundary fixes should use `just ci` when Docker or podman is available because WASM-dependent tests are otherwise skipped.
