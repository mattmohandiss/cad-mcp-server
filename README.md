# CAD MCP Server

CAD MCP Server gives AI tools local, read-only access to STEP CAD geometry.
It bundles a stripped Open CASCADE WebAssembly kernel so engineers can ask practical questions about parts and assemblies without installing native CAD software.

The server measures geometry. The LLM interprets engineering meaning.

## What You Can Ask

- "Review this STEP file like a mechanical lead before release."
- "Prepare an RFQ summary for a machine shop."
- "Compare Rev A and Rev B as an ECO review."
- "Audit the model for bearing and shaft interfaces."
- "Can these parts fit on a 200 x 200 x 300 mm printer?"
- "Build a first-pass CNC manufacturing plan."
- "Create a first-pass inspection and QA plan."

## Install

Use directly from npm with any MCP client that supports command-based servers:

```bash
npx -y cad-mcp-server
```

Requirements:

- Node.js 22 or newer
- Local access to the STEP/STP files you want to inspect

No Docker, Open CASCADE install, or native CAD application is required for normal use.

## MCP Client Config

Use this command in Claude Desktop, OpenCode, Cursor, or another MCP-compatible client:

```json
{
  "mcpServers": {
    "cad": {
      "command": "npx",
      "args": ["-y", "cad-mcp-server"]
    }
  }
}
```

For local development from a cloned repo:

```json
{
  "mcpServers": {
    "cad": {
      "command": "node",
      "args": ["/path/to/cad-mcp/dist/index.js"]
    }
  }
}
```

## What It Does

- Imports STEP/STP files locally through a bundled `occt-wasm` kernel.
- Computes bounding boxes, dimensions, volume, surface area, body count, face count, and edge statistics.
- Classifies common surface and curve types.
- Searches faces and edges by type, size, normal direction, body, grouping, and sort.
- Returns face/edge details such as area, length, radius, axis, bbox, endpoints, and local adjacency when requested.
- Parses lightweight STEP metadata and PMI-related hints when present.
- Compares two STEP files by gross dimensions, volume, area, topology counts, and metadata.
- Caches imported models so repeated engineering questions are fast.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `inspect_step_file` | Fast first-pass overview of a STEP file: validity, size, bodies, topology counts, and metadata. |
| `find_step_faces` | Search B-rep faces/surfaces by type, area, normal, body, grouping, and sort. |
| `find_step_edges` | Search B-rep edges/curves by type, length, circular radius, body, grouping, and sort. |
| `get_step_entities` | Retrieve known face or edge IDs with requested fields. |
| `query_step_pmi` | Query lightweight PMI/GD&T, dimensions, datums, and annotations when present in the STEP text. |
| `compare_step_files` | Compare two STEP files by whole-model geometry, topology counts, and metadata. |

The intended workflow is: inspect first, ask for summaries or groups, drill into entity IDs, then request local adjacency or exact fields only where needed.

## What It Is Not

CAD MCP Server is an inspection tool, not a full CAD system.

- It does not edit CAD or generate geometry.
- It does not generate CAM toolpaths.
- It does not certify manufacturability.
- It does not recover native CAD feature trees, mates, configurations, or design history from STEP.
- It does not provide authoritative AP242 PMI/GD&T interpretation.
- It does not guarantee stable feature identity across revisions.

Good answers from an AI assistant should separate measured facts, assumptions, and recommendations.

## Distribution

The npm package includes:

- MCP server JavaScript in `dist/`
- bundled `occt-wasm` package
- optimized `occt-wasm.wasm` geometry kernel
- TypeScript declarations for the published runtime files

Users install one package. Maintainers rebuild the kernel with Podman or Docker only when the OCCT facade changes.

## License

This project is MIT licensed. The bundled `occt-wasm` backend uses Open CASCADE Technology, which is distributed under LGPL-2.1. Review the relevant Open CASCADE and `occt-wasm` license terms before redistributing modified kernel builds.
