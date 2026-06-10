# Roadmap

## Product Direction

Build a portable, evidence-first STEP inspection MCP before adding heavier CAD infrastructure.

The core bet:

```text
small MCP surface + deterministic occt-wasm analysis + clear limitations
```

This creates a useful local tool now and keeps a clean path to native OCCT/XDE/BRepGraph later.

## Phase 1: Make The Current Product Honest And Useful

Goals:

- Keep the five-tool MCP surface.
- Document current capabilities precisely.
- Ensure every tool reports provider limitations.
- Keep measured facts, feature candidates, warnings, and limitations separate.

Useful work:

- Refresh docs and examples.
- Tighten output schemas and naming.
- Improve response language around candidates and uncertainty.
- Add tests for limitation reporting.

## Phase 2: Use More Of `occt-wasm`

Before adding native dependencies, exploit the wasm backend better.

High-priority improvements:

- XCAF import path for product names, colors, and assembly hierarchy.
- More explicit entity references for faces, edges, bodies, and feature candidates.
- Better measurements for cylinders, circular edges, face normals, face areas, and axes.
- Health diagnostics using `isValid`, healing helpers, and original-vs-repaired reporting.
- Improved hole and fillet candidates.
- Planar interface/datum face candidates.
- Metric compare improvements with clearer confidence and limitations.

## Phase 3: Viewer And Evidence Artifacts

Add artifacts that make findings easier to trust.

Useful outputs:

- glTF or mesh export.
- entity-to-mesh mapping if feasible.
- highlight payloads.
- links from viewer artifacts to selected entities.
- screenshot/render pipeline later if a renderer is added.

Do not require native OCCT AIS for the first viewer artifact. Keep portability first.

## Phase 4: Focused Mechanical Workflows

Only add new public tools when the fixed five-tool surface becomes demonstrably awkward.

Likely candidates:

- explicit measurement tool
- explicit feature-finding tool
- hole table tool once hole classification is good enough
- viewer artifact export tool

Do not add separate raw AAG, OWL, or arbitrary execution tools.

## Phase 5: Optional Native Provider

Add a native provider only when wasm limitations block real product value.

Native provider should target:

- OCCT XDE/OCAF import depth
- BRepGraph identity and traversal
- PMI/GD&T extraction
- detailed import validation and healing diagnostics
- stronger assembly semantics
- revision matching
- native rendering/highlighting

Keep the TypeScript MCP server as the stable protocol edge.

## Distribution Tiers

| Tier | Backend | Best for |
| --- | --- | --- |
| Local portable | TypeScript MCP + `occt-wasm` | npm install, demos, offline use, lightweight inspection. |
| Desktop/pro | TypeScript MCP + optional native sidecar | Air-gapped or professional users needing deeper CAD analysis. |
| Hosted | MCP/API facade + containerized CAD workers | SaaS, queues, caching, artifacts, larger files. |
| Enterprise | Hosted or tenant-native workers + governance | Audit, policy, isolation, signed artifacts, PLM integration. |

## Non-Goals For Now

- CAD editing.
- CAM/toolpath generation.
- Full digital twin proposal system.
- Company knowledge search.
- Microsoft Copilot-specific productization.
- OWL/SPARQL semantic layer.
- Native backend as a hard dependency.

Those may become separate product tracks later, but they should not clutter this portable MCP now.
