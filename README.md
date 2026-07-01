# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)
[![License](https://img.shields.io/npm/l/cad-mcp-server)](LICENSE)

**Read-only CAD inspection for LLMs.** A WebAssembly Open CASCADE 8.0 kernel that lets AI assistants read, measure, and compare STEP files locally. Returns deterministic geometry facts — the LLM interprets engineering meaning.

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

Point the AI at any STEP or STP file on your local filesystem.

## MCP Tools (v0.4)

| Tool           | Purpose                                                                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect_step` | First-pass overview: volume, bounding box, topology, watertight status, principal axes, PMI summary. **Use this first.**                                                                                                                                                                  |
| `query_faces`  | Find faces by type, area, radius, or body. Returns IDs, surface types, areas, radii, diameters, axes, normals, and adjacency data.                                                                                                                                                        |
| `query_edges`  | Find edges by curve type, length, or radius. Returns IDs, curve types, lengths, radii, diameters, and bounding boxes.                                                                                                                                                                     |
| `measure_step` | Run geometric measurements on faces or edges. Batch measurement (multiple entities in one call). Ops: ray_test, ray_test_grid (wall thickness), ray_test_segment, distance, draft_angle, closest_point_on_face, classify_point. Direction shortcuts: along_axis, along_axis_both, normal. |
| `diff_step`    | Compare two STEP files: volume, surface area, dimensions, face/edge/body count deltas.                                                                                                                                                                                                    |

**Design principle:** Deterministic geometry only. No interpretation, no heuristics. The server measures; the LLM decides.

## Use Cases

| Who                        | What they ask                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Mechanical lead            | "Review this STEP file before release. What are the top manufacturing risks?"             |
| Manufacturing engineer     | "Build a first-pass CNC plan: likely setups, drilling directions, cost-driving features." |
| QC engineer                | "Create an inspection plan from the STEP file. What should we measure?"                   |
| Procurement / sourcing     | "Prepare an RFQ summary: part count, envelope, complexity drivers."                       |
| Design engineer (revision) | "Compare Rev A and Rev B as an ECO review. What changed?"                                 |
| Hobbyist / maker           | "Can these parts fit on a 200×200×300mm printer?"                                         |

See [docs/EXAMPLE_PROMPTS.md](docs/EXAMPLE_PROMPTS.md) for prompt patterns.

## How It Works

STEP files are parsed locally by a stripped Open CASCADE Technology (OCCT 8.0) kernel compiled to WebAssembly. No data leaves your machine. No Docker, no cloud API, no CAD license.

## Why CAD MCP Server?

- **Zero install.** One `npx` command. No CAD software, licenses, Docker, or cloud API.
- **Read-only.** No geometry creation or modification. Inspect only.
- **Local-first.** STEP files never leave your filesystem.
- **WASM performance.** OCCT runs at near-native speed in a bundled WebAssembly kernel.
- **LLM-native.** Structured JSON output with pagination, enums, and defaults. Descriptions written for LLM reasoning.
- **OCCT-native.** Every computation uses OCCT built-in classes.
- **Batch measurement.** Measure wall thickness across 20 faces in one call.

## What It Is Not

- Not a CAD editor — no geometry creation or modification.
- Not a CAM system — no toolpath generation.
- Not a manufacturability certifier — it provides evidence, not conclusions.
- Not a feature-tree recovery tool — STEP is a boundary-representation format.

Good AI answers separate measured facts, assumptions, and engineering recommendations.

## Requirements

- Node.js 22+
- Local access to STEP/STP files

No Docker, Open CASCADE install, or native CAD application required.

## Distribution

The npm package is minimal: compiled JS, bundled `occt-wasm` WASM kernel, and TypeScript declarations. No source maps, test files, or dev configuration.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and PR guidelines.

## License

MIT. The bundled `occt-wasm` backend uses Open CASCADE Technology (LGPL-2.1). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Support

If CAD MCP Server saves you time, consider [sponsoring](https://github.com/sponsors/mattmohandiss) development.
