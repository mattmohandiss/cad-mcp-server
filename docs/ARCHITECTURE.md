# Architecture

## Summary

This project is a portable, read-only MCP server for deterministic STEP inspection. The public tool layer stays small; expensive CAD work is centralized in a cached model service.

```text
MCP host
  -> src/index.ts tool registrations
  -> src/tools/step-tools.ts handlers
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

The server provides 9 tools across two tiers:

**Primitives** (LLM composes):
1. `find_step_faces` and `find_step_edges` summarize, group, filter, sort, and page entities.
2. `get_step_entities` performs direct exact lookup for known IDs.
3. `query_step_pmi` parses lightweight STEP PMI text entities.
4. `query_ray_intersect` fires single rays or grids of rays for spatial queries.
5. `measure_distance` computes the minimum distance between any two entities.

**Measured queries** (server iterates/samples/groups):
6. `inspect_step_file` aggregates file-level facts: dimensions, volume, bodies, topology, principal axes, OBB, watertight check, PMI hints.
7. `compare_step_files` compares whole-model metrics and metadata between two files.
8. `find_coaxial_cylinders` groups cylindrical faces by shared axis and surfaces ray intersection hits.

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
