# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)
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

Point the AI at any STEP or STP file on your local filesystem.

## Use Cases

| Who                            | What they ask                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Mechanical lead**            | "Review this STEP file like a mechanical lead before release. What are the top design or manufacturing risks?" |
| **Manufacturing engineer**     | "Build a first-pass CNC plan: likely setups, drilling directions, and cost-driving features."                  |
| **QC engineer**                | "Create an inspection plan from the STEP file. What should we measure? What's missing?"                        |
| **Procurement / sourcing**     | "Prepare an RFQ summary: part count, envelope, complexity drivers, and questions the supplier will ask."       |
| **Design engineer (revision)** | "Compare Rev A and Rev B as an ECO review. What changed? What should be rechecked?"                            |
| **Hobbyist / maker**           | "Can these parts fit on a 200 x 200 x 300 mm printer? What needs splitting or reorientation?"                  |

## MCP Tools (v0.2)

| Tool            | Purpose                                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect_step`  | First-pass overview: dimensions, volume, topology, principal axes, OBB, watertight check, PMI hints. **Use this first.**                                                                                                                            |
| `query_step`    | Declarative query: filter/sort/group faces, edges, bodies, vertices, PMI, colors, layers, materials, assembly. Measure distances, fire ray tests, compute sections, compute curvature. Aggregate stats. One call replaces 5+ primitive round-trips. |
| `diff_step`     | Compare two STEP files: metric deltas, topology changes, body-level changes, XDE-level changes.                                                                                                                                                     |
| `transact_step` | Multi-step pipeline when a single query isn't enough: "for each hole, ray-test in +Z, then keep ones that didn't come out the other side."                                                                                                          |

**Design principle:** Deterministic geometry only. No interpretation, no heuristics. The server measures; the LLM decides.

The seven primitives from the v0.1 surface (face search, edge search, entity lookup, PMI query, ray test, distance, coaxial grouping) are now expressible as `query_step` calls — for example, `find_coaxial_cylinders` becomes `{entities: "faces", filter: {surface_type: "cylinder"}, group_by: ["axis"]}`. See [docs/EXAMPLE_PROMPTS.md](docs/EXAMPLE_PROMPTS.md) for prompt patterns that work with this surface.

## How It Works

STEP files are parsed locally by a stripped Open CASCADE Technology (OCCT 8.0) kernel compiled to WebAssembly. No data leaves your machine. No Docker, no cloud API, no CAD license.

## Why CAD MCP Server?

- **Zero install.** One `npx` command, no native CAD software, no licenses, no Docker, no cloud API.
- **Read-only.** No geometry creation or modification.
- **Local-first.** STEP files never leave your filesystem.
- **WASM performance.** OCCT runs at near-native speed in a bundled WebAssembly kernel.
- **LLM-native.** Structured JSON output designed for AI consumption. Every tool has defaults, enums, pagination, and descriptions written for LLM reasoning.
- **OCCT-native.** Every computation uses OCCT built-in classes — no custom math where OCCT already provides it.

## What It Is Not

- Not a CAD editor — no geometry creation or modification.
- Not a CAM system — no toolpath generation.
- Not a manufacturability certifier — it provides evidence, not conclusions.
- Not an AP242 PMI engine — PMI hints are lightweight and heuristic-based.
- Not a feature-tree recovery tool — STEP is a boundary-representation format.

Good AI answers separate measured facts, assumptions, and engineering recommendations.

## Requirements

- Node.js 22 or newer
- Local access to STEP/STP files

No Docker, Open CASCADE install, or native CAD application required.

## Distribution

The npm package is minimal: compiled JS, bundled `occt-wasm` WASM kernel, and TypeScript declarations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and PR guidelines.

## License

MIT. The bundled `occt-wasm` backend uses Open CASCADE Technology (LGPL-2.1). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Support

If CAD MCP Server saves you time, consider [sponsoring](https://github.com/sponsors/mattmohandiss) development.
