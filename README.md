# CAD MCP Server

A portable, read-only MCP server for inspecting STEP CAD files with Open CASCADE compiled to WebAssembly.

The server gives an LLM deterministic CAD tools for geometry summaries, topology facts, feature candidates, file-health warnings, and metric comparisons. It is intentionally small: the LLM interprets engineering meaning, while the MCP tools measure and cite evidence.

## Product Stance

This project is a **portable CAD inspection MCP**, not a full CAD platform.

- Use `occt-wasm` as the default local backend for easy npm distribution.
- Keep the MCP tool surface small and stable.
- Treat face adjacency and feature recognition as internal analysis, not a separate user-facing AAG product.
- Defer OWL/SPARQL/enterprise ontology work until there is a real integration requirement.
- Keep native OCCT/XDE/BRepGraph as a future provider path for production-depth workflows.
- Never claim native CAD feature-tree intent, authoritative PMI/GD&T interpretation, or stable cross-revision identity unless a backend can prove it.

## What It Can Do Today

- Import STEP/STP files through `occt-wasm`.
- Compute bounding boxes, dimensions, volume, surface area, body count, face count, and edge statistics.
- Classify common surface and curve types.
- Build an internal face-adjacency view with approximate convex/concave/smooth relationships.
- Emit feature candidates such as hole-like, through/blind-hole-like, fillet-like, and pocket-like regions.
- Parse lightweight STEP metadata such as schema/header/product hints and PMI-related entity hints.
- Compare two STEP files by gross geometry, topology counts, feature-candidate counts, metadata, and health warnings.
- Defines strict schemas for querying faces, edges, and derived feature candidates with configurable filters. Kernel-backed query implementation is planned next.

## What It Does Not Do Yet

- It does not expose the full native OCCT C++ API.
- It does not expose OCCT BRepGraph through `occt-wasm`.
- It does not recover native CAD feature trees, mates, configurations, or design history from STEP.
- It does not provide robust AP242 PMI/GD&T interpretation.
- It does not perform production-grade revision matching with stable feature identity.
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

The server exposes five tools:

| Tool | Purpose |
| --- | --- |
| `inspect_step_file` | Fast first-pass overview of a STEP file. |
| `query_step_faces` | Query B-rep faces/surfaces by configurable geometry filters. |
| `query_step_edges` | Query B-rep geometric edges/curves by configurable geometry filters. |
| `query_step_features` | Query derived feature candidates with configurable geometry filters. |
| `compare_step_files` | Metric-level comparison of two STEP files. |

See `Tools.md` for tool details and example calls.

The query tools currently expose their strict, enum-based schemas and are pending kernel-backed implementation. They are designed for multi-turn workflows: ask for summaries or groups first, then drill into entity IDs or spatial regions.

## Architecture

```text
MCP tools
  -> CAD application services
  -> CadKnowledgeGraph
  -> occt-wasm B-rep provider
  -> internal AAG-style topology provider
  -> lightweight STEP metadata provider
  -> STEP files
```

The public MCP surface stays small. Internally, provider outputs are merged into one graph so tools can return different views over the same measured facts, inferred candidates, warnings, limitations, and evidence.

For more detail, see:

- `docs/ARCHITECTURE.md`
- `docs/CAPABILITIES.md`
- `docs/ROADMAP.md`
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
  cad/                  # analysis graph builder, projections, compare services
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
- Implement the face, edge, and feature query tools with entity-level references, measurements, and evidence.
- Improve feature-candidate quality, measurements, and health checks.
- Add XCAF-backed assembly/name/color extraction where practical.
- Add mesh/viewer artifacts with durable entity mapping if feasible.

Later:

- Add an optional native OCCT/XDE/BRepGraph provider for production-depth analysis.
- Add stronger PMI, assembly, revision-compare, rendering, and manufacturability workflows only when requirements justify the complexity.

## License

This project is MIT licensed. The compiled `occt-wasm` backend inherits Open CASCADE LGPL licensing; see the `occt-wasm` package documentation for details about redistributing the WebAssembly component.
