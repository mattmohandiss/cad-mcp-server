# STEP MCP Tool Surface

## Purpose

This MCP is a read-only STEP knowledge base for mechanical-design reasoning. It inspects STEP files, measures geometry, infers features, builds a CAD knowledge graph, and explains risks and limitations — but it never edits geometry, generates CAM, or replaces drawings and native CAD.

## Best Mental Model

The MCP exposes a few access patterns over one canonical CAD knowledge graph:

- `inspect` — fast first-pass overview
- `analyze` — deep analysis with selectable categories
- `query` — targeted graph queries across turns
- `compare` — revision or supplier-file comparison
- `report` — human-readable synthesis from graph facts

The seven master categories below are the actual knowledge domains. Every tool reads from the same graph.

## Core Principles

- Keep the public MCP surface small; avoid many overlapping tools.
- Build one canonical CAD knowledge graph and expose different views of it.
- Separate measured facts from inferred candidates and recommendations.
- Include evidence, confidence, and limitations for every inferred result.
- Prefer deterministic graph queries and exact measurements over LLM-only reasoning.
- Treat STEP as geometry, topology, and exchange data, not as full design intent.

## Master Categories

### 1. Geometry

Measured physical properties.

**Questions answered:**
- What size is it?
- What is its envelope?
- What are its mass-like properties?
- What are the main bodies?

**Includes:** bounding box, dimensions, volume, surface area, centroid / center of mass, body count, face/edge counts, units, largest/smallest bodies, envelope / space claim

### 2. Topology

How the B-rep is connected.

**Questions answered:**
- Which faces touch?
- Which edges bound which faces?
- Is this a closed solid?
- Where are concave/convex relationships?

**Includes:** bodies, shells, faces, loops, edges, vertices, face adjacency graph, edge-face relationships, concave/convex/smooth adjacency, inner loops, open/naked edges, non-manifold edges, topology graph / AAG

### 3. Structure

How the STEP file is organized as a part or assembly.

**Questions answered:**
- Is this a part, multibody part, or assembly?
- What components exist?
- Are there repeated instances?
- What names/products did the supplier include?

**Includes:** assembly hierarchy, component prototypes, component instances, transforms/locations, repeated parts, body-to-component mapping, product names, subassembly depth, instance counts

### 4. Features

Engineering-relevant shape candidates inferred from geometry/topology.

**Questions answered:**
- Are there hole-like features?
- Are there fillets/chamfers?
- Are there pockets, slots, ribs, bosses, shafts?
- What features might matter for machining or mounting?

**Includes:** hole candidates, mounting-hole candidates, pocket candidates, slot candidates, cavity candidates, fillet candidates, chamfer candidates, boss/shaft candidates, rib candidates, port candidates, fastener-like bodies, feature dimensions, confidence/evidence/limitations

### 5. Spatial Relationships

Relationships between bodies, faces, components, and features.

**Questions answered:**
- Are these holes aligned?
- Is this face parallel to that one?
- Which bodies are internal?
- What defines the outer envelope?
- Are features patterned or symmetric?

**Includes:** coaxial, concentric, coplanar, parallel, perpendicular, near/far, inside/outside, intersects bounding box, aligned with, repeated pattern, symmetry candidates, envelope-defining components

### 6. Exchange And Standards

What the STEP file carries as exchange data.

**Questions answered:**
- What STEP protocol is this?
- Does it include PMI?
- Are tolerances/dimensions/datum references present?
- Is PMI semantic or only graphical?
- Are validation properties present?

**Includes:** AP203/AP214/AP242/etc., schema/header metadata, authoring system if present, units, product names, semantic PMI, graphical PMI, GD&T, dimensions, datums, saved views, validation properties, precise B-rep vs tessellated geometry, AP242/MBD readiness

### 7. Health, Complexity, And Risk

How usable, heavy, or suspicious the file is.

**Questions answered:**
- Will this be painful to import?
- Why is the file heavy?
- Is it surface-heavy or solid?
- What should I ask the supplier to simplify?
- What should I verify before manufacturing?

**Includes:** import success/failure, invalid geometry, surface-only content, open shells, tiny edges/faces, high face count, high body count, excessive small components, likely cosmetic detail, missing names, duplicate names, complexity score, import risk, simplification candidates, missing PMI/drawing warnings

## Public Tool Surface

### 1. `inspect_step_file`

Fast first-pass overview.

**Covers:** geometry summary, structure summary, exchange metadata, basic health warnings, complexity headline

**Use when:** user first asks about a file, AI needs initial context

### 2. `analyze_step_detail`

Deep analysis with selectable categories.

**Input:**
```json
{
  "file_path": "model.step",
  "categories": ["geometry", "topology", "structure", "features", "spatial", "exchange", "health"],
  "detail_level": "summary"
}
```

**Use when:** user asks deeper questions, AI needs features, graph, topology, or health details

### 3. `query_step_graph`

Targeted graph queries across turns.

**Examples:**
```json
{
  "file_path": "model.step",
  "query": { "find": "features", "where": { "type": "hole_candidate", "diameter_gte": 5 } }
}
```

```json
{
  "file_path": "model.step",
  "query": { "find": "relationships", "between": ["feature:hole_candidate:1", "feature:hole_candidate:4"] }
}
```

**Use when:** user asks specific follow-up questions, AI needs precise subgraph facts

### 4. `compare_step_files`

Revision or supplier-file comparison.

**Covers:** geometry deltas, structure deltas, feature deltas, metadata/PMI deltas, health/risk deltas

**Use when:** user asks "what changed?", supplier sends a new version

### 5. `generate_step_report`

Human-readable synthesis from graph facts.

**Report types:** `engineering_review`, `supplier_review`, `import_risk`, `space_claim`, `manufacturing_handoff`, `pmi_audit`

**Use when:** user wants a concise report, AI needs to communicate findings to another engineer/supplier

## Internal Knowledge Graph

All tools draw from one canonical graph:

```
CAD Knowledge Graph
├── geometry
├── topology
├── structure
├── features
├── spatial relationships
├── exchange/PMI
├── health/risk
└── evidence/provenance
```

A heterogeneous attributed property graph with stable IDs and typed nodes/edges.

### Core node types

`assembly`, `component_prototype`, `component_instance`, `body`, `shell`, `face`, `loop`, `edge`, `vertex`, `feature_candidate`, `warning`, `measurement`, `pmi_item`

### Core edge types

`contains`, `instantiates`, `transformed_by`, `bounded_by`, `adjacent_to`, `consists_of`, `evidence_for`, `coaxial_with`, `coplanar_with`, `parallel_to`, `perpendicular_to`, `repeated_with`, `annotates`

## Evidence Layer

Every inferred output includes confidence, evidence, and limitations:

```json
{
  "confidence": 0.82,
  "evidence": ["cylindrical face", "two circular boundary edges", "concave adjacency"],
  "limitations": ["STEP does not preserve feature tree", "thread/tolerance intent not detected"]
}
```

This keeps the MCP informative instead of over-opinionated.

## Output Style

Structured responses keep this split:

- `facts` — directly measured values
- `inferences` — candidates with confidence and evidence
- `warnings` — health, exchange, or standards risks
- `limitations` — what STEP cannot prove and what should be checked in drawings/native CAD/PMI

## Backend Direction

- Keep current `occt-wasm` path for fast baseline metrics during the first refactor.
- Add an advanced graph backend later, preferably Analysis Situs as a sidecar engine.
- Use Analysis Situs for AAG, feature recognition, topology checks, and assembly hierarchy where practical.
- Treat BRepNet, UV-Net, and AAGNet as graph-schema and ML-research references, not initial runtime dependencies.
- Consider NIST SFA, STP2OWL, and OntoBREP ideas for exchange metadata, PMI, validation properties, and semantic provenance.

## Non-Goals

- No direct geometry editing.
- No manufacturing-process generation or toolpaths.
- No authoritative tolerance/inspection claims unless PMI explicitly supports them.
- No pretending STEP preserves feature history, mates, configurations, or full design intent.
