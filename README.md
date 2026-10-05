# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)

Give any MCP host deterministic geometry intelligence for 3D CAD models. Drop in a STEP file, inspect and measure it, and compare revisions. Runs entirely on your machine — no cloud, no CAD license, no setup.

`cad-mcp` is a standalone fact server. It does not decide design intent or claim manufacturability. Specialized hosts and domain servers can use its structured results as evidence for DFM, materials, electronics integration, FEA, proposals, and other workflows.

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

Point your MCP host at any STEP file and ask questions like:

> "Inspect this part. Measure wall thickness, draft angles, and hole sizes, and report the measured facts with limitations."

## Why Engineers Use It

- **Zero setup.** One command. No CAD software, licenses, Docker, or cloud API.
- **Runs locally.** Your STEP files never leave your machine.
- **Deterministic answers.** Backed by the Open CASCADE kernel, not LLM guessing.
- **Read-only.** Inspects geometry without modifying anything.

## What It Can Do

| Tool            | Example question                                                   |
| --------------- | ------------------------------------------------------------------ |
| `inspect`       | "What are the overall dimensions and volume?"                      |
| `find_entities` | "Find all cylindrical faces. Which ones are holes vs bosses?"      |
| `find_entities` | "Select the faces on the wheel-axle component."                    |
| `measure`       | "What's the clearance between this hole and the nearest wall?"     |
| `measure`       | "Check wall thickness around every hole. Flag anything below 2mm." |
| `measure`       | "Does this part have sufficient draft for a +Z mold pull?"         |
| `diff`          | "What changed between revision A and revision B?"                  |

The `measure` tool selects the measurement with `kind` (`distance`, `thickness`, `draft`, `ray`, `ray_grid`, `point_analysis`, `section`, `continuity`).

The host or a domain capability interprets the measurements. You get structured engineering facts rather than unsupported guesses.

## Example Prompts

- "Review this part for injection molding: check draft angles with +Z pull, measure minimum wall thickness, identify undercuts."
- "Prepare a first-pass CNC plan: likely setups, drilling directions, features that drive cost."
- "Compare these two revisions and flag what needs rechecking before tooling."
- "Which holes are blind vs through? What's the depth of the blind hole?"
- "Find the thinnest wall section on this part. Is it above the 1.5mm minimum?"

See [docs/EXAMPLE_PROMPTS.md](docs/EXAMPLE_PROMPTS.md) for more.

## Requirements

- Node.js 24+
- Supported platforms: Linux x64, macOS x64/arm64, and Windows x64
- STEP files (export from SolidWorks, FreeCAD, Fusion 360, CATIA, or any CAD system)

## License

MIT. The bundled OCCT kernel uses LGPL-2.1. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
