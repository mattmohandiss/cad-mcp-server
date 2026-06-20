# Architecture

## Summary

This project is a portable, read-only MCP server for deterministic STEP inspection. The public tool layer stays small; expensive CAD work is centralized in a cached model service.

```text
MCP host
  -> src/index.ts tool registrations
  -> src/tools/step-tools.ts adapters and handlers
  -> src/cad/query/* services
  -> src/cad/model-store.ts cached imported model
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

The server is optimized for engineering drill-down:

1. `inspect_step_file` returns cheap file-level facts and defers expensive details.
2. `find_step_faces` and `find_step_edges` summarize, group, filter, sort, and page entities.
3. `get_step_entities` performs direct exact lookup for known IDs.
4. `query_step_pmi` parses lightweight STEP PMI text entities.
5. `compare_step_files` compares whole-model metrics and metadata only.

Full-model adjacency is not part of default inspection. Local adjacency is computed on demand for returned face/edge pages.

## Backend Boundaries

- `occt-wasm` handles STEP import, topology traversal, geometry measurements, and local adjacency helpers.
- Lightweight STEP parsers handle metadata and PMI hints.
- Tool handlers adapt public MCP schemas into internal query shapes.
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
- Native OCCT/XDE sidecar for deeper assembly names, colors, PMI, or large-model performance.
