# CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)
[![license](https://img.shields.io/npm/l/cad-mcp-server)](https://github.com/mattmohandiss/cad-mcp-server/blob/main/LICENSE)
[![CI](https://github.com/mattmohandiss/cad-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/mattmohandiss/cad-mcp-server/actions/workflows/ci.yml)

**Give your AI assistant a set of calipers for STEP files.**

CAD MCP is a local MCP server that lets an AI assistant open a STEP model and measure it: overall size, hole and boss diameters, wall thickness, clearances, draft, cross-sections, and what changed between two revisions. Ask in plain language, get numbers back from the Open CASCADE kernel — not from a language model guessing at a picture.

![CAD MCP measuring a STEP housing: the assistant finds a 0.8 mm wall hidden beneath a pocket, shows the cross-section, and verifies 3.0 mm of clearance in the revised STEP file.](docs/images/geometry-measured-demo.webp)

_A pocket looked ordinary until the measurement found 0.8 mm of material between the pocket floor and a cross-bore. Sectioning the real geometry confirmed it, and the revised model measured 3.0 mm._

## Asking for measurements

Once it is connected, you talk about the part, not about the API:

- "What are the overall dimensions and volume of this part?"
- "Find the cylindrical faces and list their diameters and axes."
- "Check the minimum wall thickness on these faces and report it in millimetres."
- "What is the clearance between this hole and the nearest wall?"
- "Measure draft against a +Z pull direction and flag anything negative."
- "Cut a section through this body at X = 40."
- "What changed between revision A and revision B?"

## What it measures

| Tool            | What you get                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `inspect`       | Bounding-box dimensions, volume, surface area, body/assembly structure, B-rep health, and a revision-bound artifact. |
| `find_entities` | Faces, edges, vertices, and bodies — with filters such as cylindrical faces, radii, axes, and areas.                 |
| `measure`       | Distance between faces, wall thickness, draft, rays and ray grids, point analysis, planar sections, and continuity.  |
| `diff`          | Dimension, volume, area, and topology deltas between two STEP revisions, plus parsed STEP metadata.                  |

Lengths are millimetres, angles are degrees, and every result carries the entity IDs and model revision it came from. Results are reproducible: the same file and the same query return the same numbers.

## Quick start

```bash
npx -y cad-mcp-server
```

Add it to your MCP client:

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

Then point your assistant at a STEP file and ask for measurements. Example prompts for geometry work and DFM-style reviews live in [docs/EXAMPLE_PROMPTS.md](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/EXAMPLE_PROMPTS.md).

## Why engineers use it

- **No CAD seat required.** Check a model from a chat window instead of opening a heavyweight application.
- **Your models stay yours.** STEP files are read on your machine. Nothing is uploaded, and the server never writes to your CAD data.
- **Numbers, not vibes.** Measurements come from Open CASCADE geometry, so you can act on them in a design review.
- **Revision diffs in seconds.** See what actually changed between two exports before you commit to tooling.

## Common questions

**Do I need a CAD license?** No. Any STEP file works, from any CAD system that exports STEP.

**Do my files leave my machine?** No. The server runs locally and reads files by path.

**Can it tell me whether a part is manufacturable?** It gives you the measurements that decision needs — wall thickness, clearance, draft, size — and leaves the engineering judgment with you.

## Requirements

- Node.js 24+
- Windows x64, macOS ARM64 (Apple Silicon), or Linux x64
- STEP files exported from your CAD system

## Documentation

- [Example prompts](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/EXAMPLE_PROMPTS.md) — geometry questions and composed workflows
- [Architecture](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/ARCHITECTURE.md) — tools, workflows, and limits
- [Security](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/SECURITY.md) — local processing and handling CAD files as sensitive input
- [Development](https://github.com/mattmohandiss/cad-mcp-server/blob/main/docs/DEVELOPMENT.md) — source setup, checks, packaging, and releases
- [Changelog](https://github.com/mattmohandiss/cad-mcp-server/blob/main/CHANGELOG.md)

## License

MIT. The bundled Open CASCADE sidecar uses LGPL-2.1. See [THIRD_PARTY_NOTICES.md](https://github.com/mattmohandiss/cad-mcp-server/blob/main/THIRD_PARTY_NOTICES.md).
