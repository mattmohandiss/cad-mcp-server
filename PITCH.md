# CAD MCP Server — Startup Pitch

## One-Liner

**A portable, read-only MCP server that gives AI agents deterministic tools to inspect and query STEP CAD files** — think "read-only CAD introspection for LLMs," powered by Open CASCADE compiled to WebAssembly.

## The Problem

Engineering teams work with 3D CAD models constantly, but AI assistants today are practically blind to them. STEP files are the universal interchange format for mechanical CAD, yet there is no lightweight, embeddable way for an LLM to answer basic questions like:

- What are the overall dimensions of this part?
- How many holes does it have? Are they through-holes or blind?
- What changed between these two revisions?
- Are there fillets, pockets, or thin walls?
- Is the model healthy, or are there suspicious conditions?

Existing solutions are either heavyweight desktop CAD automation (expensive, slow, not AI-native) or non-existent in the LLM tooling ecosystem.

## The Solution

`cad-mcp-server` is an npm-installable MCP server that bridges this gap. It gives LLMs a small, stable surface of exactly **6 read-only tools** backed by production-grade geometry kernels (Open CASCADE via WebAssembly). No native dependencies, no cloud round-trips, no licensing fees.

```
LLM  ←→  MCP Tools  ←→  CadKnowledgeGraph  ←→  occt-wasm (WebAssembly)
                                                ←→  STEP metadata parser
```

## What the MCP Tools Provide

### 1. `inspect_step_file` — The "vitals check"
| | |
|---|---|
| **What it does** | First-pass import: bounding box, dimensions, volume, surface area, body/face/edge counts, exchange metadata, health warnings. |
| **Why useful** | Zero-config model overview. Before any analysis, know if the file imports, what units it uses, and whether the geometry is healthy. The entry point to every workflow. |

### 2. `find_step_faces` — The "surface detective"
| | |
|---|---|
| **What it does** | Search B-rep faces by surface type (plane, cylinder, cone, sphere, torus, bspline), area range, spatial region, proximity, or normal direction. Sort, group, paginate. Returns area, bounding box, center, normal, adjacent faces, closest-face distance. |
| **Why useful** | Find all cylindrical faces (potential holes), large planar faces (potential mounting surfaces), faces near a point (potential interference), thin-wall regions (closest-face distance). Group by surface type or size to understand model composition without drowning in entities. |

### 3. `find_step_edges` — The "edge inspector"
| | |
|---|---|
| **What it does** | Search B-rep edges by curve type (line, circle, ellipse, bspline), length range, radius, spatial region, or proximity. Sort, group, paginate. Returns length, radius, start/end points, bounding box, adjacent faces. |
| **Why useful** | Find tiny/degenerate edges (potential import artifacts), long straight edges (potential datums), circular edges of a given radius (potential fastener fits). The sub-millimeter length bucket isolates problematic geometry instantly. |

### 4. `get_step_entities` — The "drill-down"
| | |
|---|---|
| **What it does** | Retrieve specific known faces or edges by exact entity ID with full detail (normals, surface parameters, adjacent faces, etc.). |
| **Why useful** | After a search returns candidate IDs, zoom in on exactly the entities that matter. The multi-turn workflow: search → group → select IDs → inspect in detail. Avoids re-querying the whole model. |

### 5. `compare_step_files` — The "revision diff"
| | |
|---|---|
| **What it does** | Side-by-side comparison of two STEP files: bounding box deltas, volume/area deltas, topology count changes, metadata differences, health warning changes. |
| **Why useful** | "What changed?" is the most common engineering question. Without stable feature IDs (a hard problem), gross metric comparison catches regressions: volume changed by 10%? Face count dropped? Bounding box shifted? Enough to flag a review without loading a CAD workstation. |

### 6. `query_step_pmi` — The "annotation reader"
| | |
|---|---|
| **What it does** | Extract Product Manufacturing Information (PMI): geometric tolerances (position, flatness, circularity, etc.), dimensions (diameter, radius, length), datums, and annotations. Filter, sort, group by type or value. |
| **Why useful** | GD&T defines the engineering intent. When present in the STEP file, PMI tells the AI which features have critical tolerances, which surfaces are datums, and what the allowable variation is. Essential for quality, inspection, and manufacturing workflows. |

## Why It Matters for AI + Engineering

**Before cad-mcp-server:**
- LLMs are blind to CAD geometry
- Engineers manually extract data or write bespoke scripts
- AI-assisted engineering workflows cannot touch the core artifact

**After:**
- An LLM can inspect, measure, compare, and reason about 3D models
- The AI stays in read-only territory — safe, no edit risk
- Multi-turn workflows: overview → group → drill → measure → decide
- Composable with other MCP tools (documentation, ERP, PLM)

## Target Users

- **AI coding agents** (Cursor, Claude Code, Copilot) that need to reason about hardware designs
- **Engineering teams** embedding LLM workflows into PLM, QA, or manufacturing pipelines
- **Platform builders** creating AI copilots for mechanical engineering
- **MCP hosts** (Zed, VS Code extensions, custom hosts) that want CAD capability

## Business Model

Open-source MIT core (`cad-mcp-server`). Value-add opportunities:
- **Managed cloud backend** (native OCCT, faster, AP242-compliant) for teams that cannot run WebAssembly in their environment
- **Enterprise features** (assembly mates, revision matching, threaded-hole tables, manufacturability scoring) on a commercial tier
- **Custom provider development** for PLM/ERP integrations

## Quick Start

```bash
npx cad-mcp-server
```

MCP config for Claude Code, Cursor, or any MCP host:

```json
{
  "mcpServers": {
    "cad": {
      "command": "npx",
      "args": ["cad-mcp-server"]
    }
  }
}
```
