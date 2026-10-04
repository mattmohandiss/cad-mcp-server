# CAD MCP Architecture

## Role

`cad-mcp` is a portable, read-only MCP server for deterministic STEP geometry facts.

It answers:

> What is geometrically true about this model?

It is useful through any MCP host. CAD Viewer is one enhanced host that adds spatial focus, context, cross-server workflows, and review persistence.

## Runtime

```text
MCP host
  → src/index.ts        tool registration and modern MCP lifecycle
  → src/tools/          public tool adapters
  → src/sidecar/        persistent sidecar client and one-model cache
  → occt/sidecar/       Open CASCADE STEP/geometry operations
```

The server runs locally through stdio by default. The optional viewer artifact API serves manifests and mesh chunks to a compatible local Viewer session; it is not required for standalone MCP use.

## Sidecar Model Lifecycle

`SidecarModelStore` keys its single resident model by resolved path, file size,
and modification time. Geometry, XCAF documents, and OCCT handles remain inside
the persistent sidecar process; the TypeScript host receives bounded JSON facts
or CVM1 binary mesh chunks. Tool callers provide explicit file paths and should
treat entity IDs as revision-scoped.

## Public Tools

### Geometry model

Two views of one model, at different granularity, matching how an engineer works:

- **Component view** — the assembly tree: named, reusable, multi-instance parts.
  `inspect include=["assembly"]` returns the bill of materials (one row per
  distinct component name with its instance count) and the nested tree.
- **Entity view** — the flattened geometry: `face:N`, `edge:N`, `vertex:N`,
  `body:N`. This is what measurements consume and what reviews persist.

An engineer selects by **component name** and measures by **entity**. Selection
projects one way: a named component resolves to the concrete entities of its own
geometry. The entity id carries that scope, so a result is never ambiguous:

```
face:12                          a face of the whole part
component:wheel-axle/face:0      a face of the named component "wheel-axle"
```

`component_name` / `component_name_contains` on `find_entities`
select by the component view and return component-scoped ids. `body_id` /
`body_ids` remain numeric filters over the whole part. `measure` accepts either
id form, and `remember` / `recall` store and match ids verbatim.

OCCT XCAF assembly instances are separate shape copies, so a component's faces
are not identity-equal to the root shape's enumeration. Component selection
therefore resolves through the component's own shape handle (`componentShape`),
never by reconciling it into the whole-part enumeration.

### Overview

- `inspect` — dimensions, counts, health, quality, topology, PMI, and inertia details.
  `include=["assembly"]` adds the bill of materials (component names with instance
  counts) and the component tree.

### Discovery

- `find_entities` — find faces or edges (`entity_type="face"|"edge"`) by type, area, radius, normal, component name, body, quality, grouping, and aggregation.

### Measurement

- `measure` — one tool, selected by `kind`: `distance` (clearance between entity sets), `thickness` (wall thickness), `draft` (draft angle vs a pull direction), `ray` / `ray_grid` (cast rays), `point_analysis`, `section` (planar cross-section), and `continuity` (edge smoothness).

### Comparison

- `diff` — dimensions, volume, surface area, and topology deltas between two STEP revisions.

All tools return structured results with output schemas. Where a result is used by an intelligence-aware host, it may be normalized as `facts`, `analysis`, or `comparison` under the contract documented by the host. The server remains useful when that optional contract is not recognized.

## Boundaries

`cad-mcp` owns:

- STEP import and parsing.
- Topology and geometry queries.
- Deterministic measurements.
- CAD revision comparison.

`cad-mcp` does not own:

- Human labels or notes.
- Review decisions.
- Manufacturing rules.
- Material recommendations.
- FEA interpretation.
- Customer proposals.
- CAD editing.
- Compliance certification.

The LLM or a domain capability may interpret geometry facts, but must preserve the distinction between measured facts and engineering judgment.

## Design Principles

- Deterministic computation through OCCT.
- Strict input schemas.
- Structured output rather than raw kernel handles.
- Thin public adapters over reusable query services.
- Batch operations where possible.
- Read-only behavior.
- No arbitrary kernel-code execution.
- No claims of manufacturability or compliance without domain evidence.

## Security

CAD files are sensitive engineering IP and are treated as untrusted input. See [SECURITY.md](SECURITY.md) for local, hosted, and enterprise processing requirements.

## Known Limitations

- **Exact distance between overlapping shapes is slow.** `measure kind="distance"`
  answers from the axis-aligned bounding boxes when they are apart, which is the
  clearance case and is immediate. When the boxes overlap there is no cheap
  bound, so the exact `BRepExtrema` solver runs; on dense B-spline geometry that
  can take tens of seconds for a single pair. Prefer measuring faces rather than
  whole solids.
- **Very large assemblies are slow to import.** Import cost scales with
  topology, not file size; measure cold and warm sidecar requests on target
  assemblies before setting latency expectations.
- **A STEP file that the XCAF assembly reader rejects can still load through the
  plain STEP path.** `importAssembly` is the assembly-aware reader; when it
  fails on a particular producer's product graph, that part cannot be inspected
  through the assembly tools.

## Non-Goals

- Full CAD editing.
- CAM generation.
- Native feature-tree recovery.
- Authoritative PMI or GD&T certification.
- Stable semantic feature identity across arbitrary revisions.
- Manufacturing conclusions without a domain-specific capability.

## Extension Direction

Future servers should consume or complement CAD facts rather than duplicating the geometry kernel. Examples include DFM, electromechanical integration, materials, drawings, and FEA. Domain servers should return explicit evidence, limitations, and revision-scoped subjects when they make engineering claims.
