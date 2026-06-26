# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![License](https://img.shields.io/npm/l/cad-mcp-server)](LICENSE)
[![Node version](https://img.shields.io/node/v/cad-mcp-server?logo=node.js)](package.json)

**Read-only CAD inspection for LLMs, zero install.** Bundles a WebAssembly Open CASCADE 8.0 kernel so AI assistants can read, measure, and compare STEP files locally. Returns deterministic geometry facts — the LLM interprets engineering meaning.

## Quick Start

```bash
npx -y cad-mcp-server
```

Add to your MCP client config (Claude Desktop, OpenCode, Cursor, etc.):

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

## MCP Tools (v1.0)

| Tool | Purpose |
|---|---|
| `inspect_step_file` | First-pass overview: dimensions, volume, bodies, topology, principal axes, OBB, watertight check, PMI hints |
| `find_step_faces` | Filter/sort/group faces by surface type, area, normal, body. Computes `draft_angle_deg` when `pull_direction` is set. |
| `find_step_edges` | Filter/sort/group edges by curve type, length, radius, convexity. Includes vertex IDs for cross-edge tracking. |
| `get_step_entities` | Retrieve known face/edge IDs with requested fields. |
| `query_step_pmi` | Query lightweight PMI/GD&T: tolerances, dimensions, datums, annotations. |
| `query_ray_intersect` | Fire a single ray or grid of rays. Grid mode fires rows×columns rays internally for wall thickness measurement. |
| `measure_distance` | Minimum distance between any two entity IDs (faces, edges, bodies). |
| `compare_step_files` | Whole-model metric deltas between two STEP files. |
| `find_coaxial_cylinders` | Group cylindrical faces by shared axis. Surfaces ray intersection hits in both directions. No classification. |

**Design principles:** Deterministic geometry only. No interpretation, no heuristics. The server measures; the LLM decides.

## How It Works

STEP files are parsed locally by a stripped Open CASCADE Technology (OCCT 8.0) kernel compiled to WebAssembly. No data leaves your machine. No Docker, no cloud API, no CAD license.

## Why CAD MCP Server?

- **Zero install.** One `npx` command, no CAD software, no licenses.
- **Read-only.** No geometry creation or modification.
- **Local-first.** STEP files never leave your filesystem.
- **WASM performance.** OCCT runs at near-native speed.
- **LLM-native.** Structured JSON output designed for AI consumption. Every tool has defaults, enums, pagination, and descriptions written for LLM reasoning.
- **OCCT-native.** Every computation uses OCCT built-in classes — no custom math where OCCT already provides it.

## Roadmap

- **v1.0** — 9-tool stable surface (current)
- **Future** — XDE integration (assembly tree, product names, GD&T-to-face links, colors)

## Requirements

- Node.js 22+
- Local STEP/STP files

## Distribution

The npm package is minimal: compiled JS, bundled `occt-wasm` WASM kernel, and TypeScript declarations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and PR guidelines.

## License

MIT. The bundled `occt-wasm` backend uses Open CASCADE Technology (LGPL-2.1). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
