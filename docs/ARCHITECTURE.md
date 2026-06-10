# Architecture

## Summary

This project is a portable MCP server for deterministic STEP inspection. The LLM-facing layer stays small and stable; the CAD work happens inside provider-backed analysis services.

```text
LLM host
  -> MCP tools
  -> tool handlers
  -> CAD analysis service
  -> provider outputs
  -> CadKnowledgeGraph
  -> inspect, entity-query, and compare projections
```

## Current Runtime

The current runtime is TypeScript/Node with `occt-wasm`.

```text
src/index.ts
  -> src/tools/*
  -> src/cad/analyze.ts
  -> src/providers/occt-wasm/*
  -> src/providers/lightweight-step/*
```

Provider roles:

| Provider | Current implementation | Role |
| --- | --- | --- |
| B-rep | `OcctWasmBRepProvider` | STEP import, bodies, dimensions, volume, area, face/edge counts, surface/curve facts. |
| Topology/features | `OcctWasmAagProvider` | Internal face adjacency, approximate vexity, feature candidates. |
| Exchange metadata | `LightweightStepSemanticProvider` | STEP schema/header/product/PMI keyword hints. |

## Why TypeScript MCP Plus WASM

This shape is intentional:

- MCP is schema and orchestration heavy, which fits TypeScript well.
- `occt-wasm` makes local distribution simple through npm.
- The server can run without native Open CASCADE installation.
- The provider boundary leaves room for a native backend later.

Do not rewrite the MCP server just to gain CAD depth. Add deeper CAD runtimes behind provider interfaces when the product needs them.

## What `occt-wasm` Is

`occt-wasm` is upstream Open CASCADE compiled to WebAssembly with a curated TypeScript API. It is not a rewrite of Open CASCADE, but it is also not the full native C++ API surface.

The installed package exposes useful operations for this MCP:

- STEP import/export.
- BREP/STL/glTF-related paths.
- Shape traversal and subshape queries.
- Bounding boxes and mass properties.
- Surface and curve classification.
- Face adjacency helpers.
- Tessellation.
- Healing helpers such as `fixShape`, `healSolid`, and `unifySameDomain`.
- Limited XCAF document support for names, colors, and assemblies.

It does not currently expose OCCT BRepGraph through the TypeScript API.

## Internal Graph

The graph is an AI-facing domain model, not a claim that all source CAD semantics are available.

It contains:

- nodes for files, bodies, faces, edges, measurements, features, warnings, and limitations
- edges for containment, adjacency, evidence, derivation, and relationships
- facts for direct measurements
- inferences for candidates and heuristics
- provider provenance

The graph exists to make answers auditable and queryable. It should not become a dumping ground for raw kernel internals.

## AAG Position

Face adjacency is useful for feature recognition, but AAG should remain an implementation detail for now.

Expose engineer-facing outputs:

- adjacent faces
- convex/concave/smooth relationships
- hole-like candidates
- fillet-like candidates
- pocket-like candidates
- evidence source IDs

Avoid user-facing AAG concepts unless explicitly debugging.

## OWL Position

Do not build OWL/SPARQL now.

OWL can become useful later for enterprise semantic interoperability, formal PMI workflows, or PLM knowledge graphs. It is not needed for the current portable inspection MCP and would add operational complexity before the geometry answers are strong enough.

Use structured JSON facts and graph projections first.

## Future Native Provider

A native provider may be justified when the product needs:

- full OCCT XDE/OCAF document semantics
- BRepGraph identity, layers, cache, and graph-native traversal
- robust AP242 PMI/GD&T extraction
- stronger assembly structure and validation properties
- detailed healing diagnostics
- high-confidence revision matching
- native rendering/highlighting
- performance on large assemblies

Recommended future shape:

```text
TypeScript MCP server
  -> provider interface
      -> occt-wasm provider, portable baseline
      -> native OCCT/XDE/BRepGraph sidecar, optional depth provider
      -> hosted CAD worker, optional SaaS/enterprise provider
```

## Design Constraints

- Keep tools read-only.
- Keep tool schemas strict.
- Do not let LLMs run arbitrary CAD code.
- Separate facts from candidates.
- State backend limitations in every report-worthy output.
- Prefer better use of `occt-wasm` before adding heavy dependencies.
