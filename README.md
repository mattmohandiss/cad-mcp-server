# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![License](https://img.shields.io/npm/l/cad-mcp-server)](LICENSE)
[![Node version](https://img.shields.io/node/v/cad-mcp-server?logo=node.js)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)

**AI-native CAD inspection, no CAD license required.** CAD MCP Server bundles a WebAssembly Open CASCADE kernel so LLM tools can read, measure, and compare STEP files locally. The server returns measured facts; your AI assistant interprets engineering meaning.

## Quick Start

```bash
npx -y cad-mcp-server
```

Add this to your MCP client config (Claude Desktop, OpenCode, Cursor, etc.):

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

Point the AI at any STEP or STP file on your local filesystem.

## Use Cases

| Who | What they ask |
|---|---|
| **Mechanical lead** | "Review this STEP file like a mechanical lead before release. What are the top design or manufacturing risks?" |
| **Manufacturing engineer** | "Build a first-pass CNC plan: likely setups, drilling directions, and cost-driving features." |
| **QC engineer** | "Create an inspection plan from the STEP file. What should we measure? What's missing?" |
| **Procurement / sourcing** | "Prepare an RFQ summary: part count, envelope, complexity drivers, and questions the supplier will ask." |
| **Design engineer (revision)** | "Compare Rev A and Rev B as an ECO review. What changed? What should be rechecked?" |
| **Hobbyist / maker** | "Can these parts fit on a 200 x 200 x 300 mm printer? What needs splitting or reorientation?" |

## MCP Tools

| Tool | Purpose |
|---|---|
| `inspect_step_file` | Fast first-pass overview: validity, size, bodies, topology counts, metadata. |
| `find_step_faces` | Search B-rep faces by surface type, area, normal, body, grouping, and sort. |
| `find_step_edges` | Search B-rep edges by curve type, length, radius, body, grouping, and sort. |
| `get_step_entities` | Retrieve known face or edge IDs with requested fields. |
| `query_step_pmi` | Query lightweight PMI/GD&T, dimensions, datums, and annotations. |
| `compare_step_files` | Compare two STEP files by whole-model geometry, topology, and metadata. |

**Recommended workflow:** `inspect` first, drill into groups or summaries, ask for specific entity IDs, then request adjacency or exact fields only where needed.

## How It Works

STEP files are parsed locally by a stripped Open CASCADE Technology (OCCT) kernel compiled to WebAssembly. No data leaves your machine. No Docker, no cloud API, no CAD vendor dependency. The package bundles everything — just `npx` and go.

## Why CAD MCP Server?

- **Zero install friction.** One `npx` command, no native CAD software, no licenses.
- **Read-only by design.** The server measures geometry; the AI interprets meaning. No risk of accidental edits.
- **Local-first.** All processing stays on your machine. STEP files never leave your filesystem.
- **WASM-speed.** OCCT runs at near-native speed in a bundled WebAssembly kernel.
- **LLM-native output.** Results are structured JSON designed for AI consumption, not human eyeballs.

## What It Is Not

- Not a CAD editor — no geometry creation or modification.
- Not a CAM system — no toolpath generation.
- Not a manufacturability certifier — it provides evidence, not conclusions.
- Not an AP242 PMI engine — PMI hints are lightweight and heuristic-based.
- Not a feature-tree recovery tool — STEP is a boundary-representation format.

Good AI answers separate measured facts, assumptions, and recommendations.

## Roadmap

- **v0.2** — Advanced face adjacency graphs, edge-vexity classification, larger file support.
- **v0.3** — Assembly hierarchy traversal, color/layer metadata, improved PMI coverage.
- **v1.0** — Stable tool surface, first-semver API guarantees.

Interested in hosted or enterprise features? Let us know via [GitHub Discussions](https://github.com/mattmohandiss/cad-mcp-server/discussions).

## Requirements

- Node.js 22 or newer
- Local access to STEP/STP files

No Docker, Open CASCADE install, or native CAD application required.

## Distribution

The npm package includes:
- MCP server JavaScript in `dist/`
- Bundled `occt-wasm` package with optimized `occt-wasm.wasm` geometry kernel
- TypeScript declarations for published runtime files

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and pull request guidelines.

## License

This project is **MIT licensed** — free for all uses, commercial included.

The bundled `occt-wasm` backend uses Open CASCADE Technology (LGPL-2.1). Review the [third-party notices](THIRD_PARTY_NOTICES.md) before redistributing modified kernel builds.

## Support

If CAD MCP Server saves you time, consider [sponsoring](https://github.com/sponsors/mattmohandiss) development.
