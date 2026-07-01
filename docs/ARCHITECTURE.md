# Architecture

## Summary

A portable, read-only MCP server for deterministic STEP inspection. The public tool layer stays small; expensive CAD work is centralized in a cached model service.

```text
MCP host
  → src/index.ts        tool registrations (5 tools)
  → src/tools/          thin adapters (inspect, query-faces, query-edges, measure, diff)
  → src/query/          face/edge services + measure dispatch
  → src/model-store.ts  cached imported model (OCCT shape handle, B-rep, entities)
  → occt-wasm           Open CASCADE 8.0 kernel compiled to WebAssembly
```

## Runtime Model

`StepModelStore` owns loaded STEP models keyed by resolved path, file size, and mtime. Each model caches:

- STEP text
- Imported OCCT shape handle
- B-rep summary (bbox, volume, surface area, topology)
- Semantic metadata (product names, authoring system, PMI presence)
- Face entities (surface type, area, radius, axis, normal, adjacency)
- Edge entities (curve type, length, radius, vertices)

The store uses a small LRU cache and avoids eviction of models actively used by in-flight queries.

## Tool Strategy

5 tools. Every manufacturing inspection question can be answered with these primitives.

1. **`inspect_step`** — cheap first-pass overview: volume, bounding box, topology, watertight status, principal axes, PMI summary. Use first.

2. **`query_faces`** — find faces by type, area, radius, or body. Default response includes adjacency data showing which faces touch which other faces. Returns IDs, surface types, areas, radii, diameters, axes, normals.

3. **`query_edges`** — find edges by curve type, length, or radius. Returns IDs, curve types, lengths, radii, diameters, start/end points.

4. **`measure_step`** — batch geometric measurement. Send entity IDs from prior queries. 7 ops: ray_test, ray_test_grid (wall thickness), ray_test_segment, distance, draft_angle, closest_point_on_face, classify_point. Direction shortcuts (along_axis, along_axis_both, normal) resolve per-entity.

5. **`diff_step`** — compare two STEP files: volume, surface area, dimensions, face/edge/body count deltas. Deltas are comparison minus baseline.

Face adjacency is computed via BRepGraph O(1) lookups and included by default in `query_faces` responses.

## Backend Boundaries

- **occt-wasm** handles STEP import, topology traversal, geometry measurements, and local adjacency helpers.
- **Lightweight STEP parsers** handle metadata and PMI hints.
- **Tool handlers** are thin adapters that map public query params to internal services.
- **Query services** return factual JSON. The LLM interprets engineering meaning.

## Design Principles

- **Deterministic.** Every computation uses OCCT built-in classes. No custom math where OCCT already provides it.
- **Read-only.** No geometry creation or modification.
- **Entity-type split.** `query_faces` and `query_edges` are separate tools. The model cannot fill face fields in edge queries (the #1 failure mode in LLM tool use).
- **Adapters over engines.** Tool handlers are thin adapters. The face/edge services are the internal contract. No central query engine orchestrator.
- **Batch-first.** `measure_step` accepts multiple entity IDs. The model measures all faces in one call, not one at a time.

## Non-Goals

- No CAD editing or CAM generation.
- No native CAD feature-tree recovery.
- No authoritative PMI/GD&T validation.
- No stable feature identity across revisions.
- No arbitrary kernel-code execution by the LLM.

## Future Work

- OCCT XDE reader path for assembly names, colors, GD&T-to-face links.
- Cross-section analysis (`section_by_plane` kernel binding).
- glTF export with face coloring for visual inspection.
- Assembly/multi-body awareness (query per body, assembly tree traversal).
