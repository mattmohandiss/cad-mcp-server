# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)

Give your AI assistant the ability to inspect, measure, and compare 3D CAD models. Drop in a STEP file, ask engineering questions, get measured answers. Runs entirely on your machine — no cloud, no CAD license, no setup.

## Quick Start

```bash
npx -y cad-mcp-server
```

Add to your MCP client:

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

Point your AI at any STEP file and ask questions like:

> "Review this part before manufacturing. Check wall thickness, draft angles, and hole sizes. Flag anything that violates standard DFM rules."

## Why Engineers Use It

- **Zero setup.** One command. No CAD software, licenses, Docker, or cloud API.
- **Runs locally.** Your STEP files never leave your machine.
- **Deterministic answers.** Backed by the Open CASCADE kernel, not LLM guessing.
- **Read-only.** Inspects geometry without modifying anything.

## What It Can Do

| Tool           | Example question                                                   |
| -------------- | ------------------------------------------------------------------ |
| `inspect_step` | "What are the overall dimensions and volume?"                      |
| `query_faces`  | "Find all cylindrical faces. Which ones are holes vs bosses?"      |
| `query_edges`  | "What's the smallest fillet radius on this part?"                  |
| `measure_step` | "Check wall thickness around every hole. Flag anything below 2mm." |
| `diff_step`    | "What changed between revision A and revision B?"                  |

The AI assistant interprets the measurements. You get engineering answers, not raw numbers.

## Example Prompts

- "Review this part for injection molding: check draft angles with +Z pull, measure minimum wall thickness, identify undercuts."
- "Prepare a first-pass CNC plan: likely setups, drilling directions, features that drive cost."
- "Compare these two revisions and flag what needs rechecking before tooling."
- "Which holes are blind vs through? What's the depth of the blind hole?"
- "Find the thinnest wall section on this part. Is it above the 1.5mm minimum?"

See [docs/EXAMPLE_PROMPTS.md](docs/EXAMPLE_PROMPTS.md) for more.

## Requirements

- Node.js 22+
- STEP files (export from SolidWorks, FreeCAD, Fusion 360, CATIA, or any CAD system)

## License

MIT. The bundled OCCT kernel uses LGPL-2.1. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
