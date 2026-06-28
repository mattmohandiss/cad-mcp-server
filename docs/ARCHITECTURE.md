# Architecture

## Summary

This project is a portable, read-only MCP server for deterministic STEP inspection. The public tool layer stays small; expensive CAD work is centralized in a cached model service.

```text
MCP host
  -> src/index.ts tool registrations
  -> src/tools/{inspect,query,diff,transact}.ts handlers
  -> src/query/* services
  -> src/model-store.ts cached imported model
  -> occt-wasm + lightweight STEP text parsers
```

## Runtime Model

`StepModelStore` owns loaded STEP models. A model is keyed by resolved path, file size, and mtime. Each loaded model can cache:

- STEP text
- imported OCCT shape handle
- B-rep summary
- semantic metadata
- PMI entities
- face entities
- edge entities
- body maps when requested

The store keeps a small in-memory LRU cache and skips eviction of models actively used by an in-flight query.

## Tool Strategy

The server exposes 4 tools: a top-level inspector, a declarative entity query, a file-vs-file diff, and a multi-step pipeline executor. The declarative query subsumes the v0.1 primitives (face/edge search, entity lookup, PMI query, ray test, distance, coaxial grouping) — those became `{entities, filter, group_by, measure, aggregate}` calls rather than separate tools.

1. `inspect_step` returns cheap file-level facts and defers expensive details. Use first.
2. `query_step` filters, sorts, groups, measures, and aggregates entities. This is the workhorse. Examples: coaxial cylinders = `{entities: "faces", filter: {surface_type: "cylinder"}, group_by: ["axis"]}`; wall thickness = `measure: [{op: "ray_test_grid", ...}]` over candidate faces.
3. `diff_step` compares whole-model metrics, topology, and XDE metadata between two files.
4. `transact_step` runs a sequence of typed pipeline ops (query, for_each, filter_results, select, walk_assembly) for workflows that need iteration across result sets.

Full-model adjacency is not part of default inspection. Local adjacency is computed on demand for returned face/edge pages via BRepGraph O(1) lookups.

## Backend Boundaries

- `occt-wasm` handles STEP import, topology traversal, geometry measurements, and local adjacency helpers.
- Lightweight STEP parsers handle metadata and PMI hints.
- Tool handlers pass validated public query params directly to query services.
- Query services return factual JSON; the LLM interprets engineering meaning.

## Non-Goals

- No CAD editing or CAM generation.
- No native CAD feature-tree recovery.
- No authoritative PMI/GD&T validation.
- No stable feature identity across revisions.
- No arbitrary kernel-code execution by the LLM.

## Future Work

Possible future extensions should remain behind the same tool/service boundary:

- Lazy/columnar face and edge extraction for faster first broad queries.
- Optional explicit topology graph tool if full adjacency workflows become necessary.
- OCCT XDE reader path (`STEPCAFControl_Reader` + `XCAFDoc_*Tool`) for assembly names, colors, GD&T-to-face links, and validation properties.
