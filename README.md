# CAD MCP Server

A portable, read-only MCP server for inspecting STEP CAD files with Open CASCADE compiled to WebAssembly.

The server gives an LLM deterministic CAD tools for geometry summaries, entity search, local topology facts, PMI hints, file-health warnings, and metric comparisons. It is intentionally small: the LLM interprets engineering meaning, while the MCP tools measure and cite evidence.

## Product Stance

This project is a **portable CAD inspection MCP**, not a full CAD platform.

- Use `occt-wasm` as the default local backend for easy npm distribution.
- Keep the MCP tool surface small and stable.
- Keep first-pass inspection cheap; defer expensive adjacency/entity detail until a follow-up query asks for it.
- Defer OWL/SPARQL/enterprise ontology work until there is a real integration requirement.
- Keep native OCCT/XDE/BRepGraph as a future provider path for production-depth workflows.
- Never claim native CAD feature-tree intent, authoritative PMI/GD&T interpretation, or stable cross-revision identity unless a backend can prove it.

## What It Can Do Today

- Import STEP/STP files through `occt-wasm`.
- Compute bounding boxes, dimensions, volume, surface area, body count, face count, and edge statistics.
- Classify common surface and curve types.
- Query faces and edges by type, size, spatial region, body, and exact entity ID.
- Return local face/edge adjacency on demand for selected result pages.
- Parse lightweight STEP metadata such as schema/header/product hints and PMI-related entity hints.
- Query lightweight PMI entities such as geometric tolerances, dimensions, datums, and annotations.
- Compare two STEP files by gross geometry, topology counts, metadata, and health warnings.
- Cache imported models and derived entity data so repeated engineering queries on the same file are fast.

## What It Does Not Do Yet

- It does not expose the full native OCCT C++ API.
- It does not expose OCCT BRepGraph through `occt-wasm`.
- It does not recover native CAD feature trees, mates, configurations, or design history from STEP.
- It does not provide robust AP242 PMI/GD&T interpretation.
- It does not perform production-grade revision matching with stable feature identity.
- It does not build full-model adjacency graphs during default inspection; adjacency is local/on-demand.
- It does not edit CAD, generate CAM/toolpaths, or certify manufacturability.
- It does not run an OWL/SPARQL semantic layer.

## Quick Start

```bash
just setup
just build
npm start
```

Run validation:

```bash
just check
```

## MCP Tools

The server exposes six tools:

| Tool | Purpose |
| --- | --- |
| `inspect_step_file` | Fast first-pass overview of a STEP file: validity, size, bodies, topology counts, and PMI hints. |
| `find_step_faces` | Search B-rep faces/surfaces by type, area, normal, body, region, proximity, grouping, and sort. |
| `find_step_edges` | Search B-rep edges/curves by type, length, circular radius, body, region, proximity, grouping, and sort. |
| `get_step_entities` | Retrieve known face or edge IDs with requested fields. This is the fastest drill-down path. |
| `query_step_pmi` | Query lightweight PMI/GD&T, dimensions, datums, and annotations when present in the STEP text. |
| `compare_step_files` | Metric-level comparison of two STEP files. |

The intended workflow is: inspect first, ask for summaries or groups, drill into entity IDs, then request local adjacency or exact fields only where needed.

## Architecture

```text
MCP tools
  -> tool adapters and query services
  -> cached StepModelStore
  -> occt-wasm imported shape and derived B-rep/entity caches
  -> lightweight STEP metadata and PMI parsers
  -> STEP files
```

The public MCP surface stays small. Internally, the model store caches imported shapes and derived data keyed by resolved path, size, and mtime. Expensive full-model adjacency is not part of default inspection; local adjacency is computed only when requested by query fields.

For more detail, see:

- `Tools.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`

## Response Shape

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "type": "file_not_found|invalid_format|parse_error|unknown",
    "message": "..."
  }
}
```

Tool outputs separate:

- `facts`: directly measured or parsed values.
- `inferences`: feature, spatial, or health candidates with evidence.
- `warnings`: suspicious conditions and risks.
- `limitations`: what current providers cannot prove.
- `providers`: backend capabilities and limitations.

## Project Structure

```text
src/
  index.ts              # MCP server entrypoint
  tools/                # MCP tool handlers
  cad/                  # model cache, query services, analysis graph builder, compare services
  providers/            # provider interfaces and implementations
  providers/occt-wasm/  # portable OCCT WebAssembly backend
  tests/                # integration fixtures and tests
docs/                   # active product and architecture docs
samples/                # sample STEP files
```

## Roadmap Summary

Near term:

- Make documentation and limitations precise.
- Use more of the existing `occt-wasm` API before adding native dependencies.
- Improve lazy/columnar face and edge extraction for faster first broad queries on very large files.
- Add an explicit topology-analysis tool if full graph workflows become necessary.
- Add XCAF-backed assembly/name/color extraction where practical.
- Add mesh/viewer artifacts with durable entity mapping if feasible.

Later:

- Add an optional native OCCT/XDE/BRepGraph provider for production-depth analysis.
- Add stronger PMI, assembly, revision-compare, rendering, and manufacturability workflows only when requirements justify the complexity.

## License

This project is MIT licensed. The compiled `occt-wasm` backend inherits Open CASCADE LGPL licensing; see the `occt-wasm` package documentation for details about redistributing the WebAssembly component.
