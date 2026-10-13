# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)

Give your AI assistant measured geometry from STEP CAD files.

CAD MCP is a local MCP server for inspecting and measuring STEP models. Powered by Open CASCADE, it finds geometric entities, measures distances, wall thickness and draft, and compares revisions—returning structured results for AI engineering workflows.

Use its geometry measurements as evidence alongside drawings, tolerances, materials, and process rules in your engineering workflow.

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

Run the server locally over stdio, configure it in your MCP host, and provide a STEP file path accessible to the server machine. For example, ask:

> "Inspect this STEP model. Report its overall dimensions and volume, find the cylindrical faces, then measure draft on the faces I select. Keep measurements separate from manufacturing conclusions."

## Why Engineers Use It

- **Quick to try.** Launch with `npx`; no CAD application, license, or Docker required.
- **Local geometry processing.** The server reads STEP files on the machine where it runs; no hosted CAD-processing service is required.
- **Deterministic answers.** Backed by the Open CASCADE kernel, not LLM guessing.
- **Non-destructive.** Analyze models while preserving your source files.

## What It Can Do

| Tool            | Example question                                          |
| --------------- | --------------------------------------------------------- |
| `inspect`       | "What are the overall dimensions and volume?"             |
| `find_entities` | "Find cylindrical faces and report their radii and axes." |
| `measure`       | "Measure the distance between these selected faces."      |
| `measure`       | "Measure wall thickness for these selected faces."        |
| `measure`       | "Measure draft relative to the +Z direction."             |
| `diff`          | "What changed between revision A and revision B?"         |

Call `inspect` with a local file URI, retain its SHA-256 artifact reference, and
pass that reference to `find_entities` and `measure` along with the exact returned
entity IDs. Stale revisions are rejected. Geometry's artifact format is STEP,
with a required local URI and mm units; IDs belong to the returned producer/ID
scheme and revision. Measurement kinds are `distance`, `thickness`, `draft`,
`ray`, `ray_grid`, `point_analysis`, `section`, and `continuity`. Lengths use
millimeters and angles use degrees.

The server returns structured geometry measurements that hosts and domain capabilities can use in engineering workflows.

## Documentation

- [Example prompts](docs/EXAMPLE_PROMPTS.md) — geometry questions and composed workflows
- [Architecture](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/ARCHITECTURE.md) — tools, boundaries, and limitations
- [Security](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/SECURITY.md) — local processing and security considerations
- [Development](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/DEVELOPMENT.md) — source setup, server checks, packaging, and releases

## Requirements

- Node.js 24+
- STEP files exported by CAD software

Combine measured geometry with drawings, tolerances, materials, and process rules for context-rich engineering reviews.

## License

MIT. The bundled OCCT kernel uses LGPL-2.1. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
