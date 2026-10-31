# Ottogeo — CAD MCP Server

[![npm version](https://img.shields.io/npm/v/cad-mcp-server?logo=npm)](https://npmjs.com/package/cad-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/cad-mcp-server)](https://npmjs.com/package/cad-mcp-server)
[![license](https://img.shields.io/npm/l/cad-mcp-server)](https://github.com/ottonic/cad-mcp-server/blob/main/LICENSE)
[![CI](https://github.com/ottonic/cad-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ottonic/cad-mcp-server/actions/workflows/ci.yml)

Give any AI assistant the ability to measure real CAD geometry. The server opens
STEP files with the Open CASCADE kernel and answers the questions an engineer
actually asks — overall size and volume, hole and boss diameters, wall thickness,
clearance, draft, cross-sections, and what changed between two revisions — with
numbers computed from the model's own B-rep, not estimated from a screenshot.

![The assistant measures a pocket floor to cross-bore distance of 0.8 mm, sections the model to confirm it, and verifies 3.0 mm in the revised STEP file.](docs/images/geometry-measured-demo.webp)

## Quick start

Add the server to your MCP client, then point your assistant at a STEP file:

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

Works with any MCP client — Claude Desktop, Cursor, VS Code, and the rest.

## Ask it anything about a part

- "What are the overall dimensions and volume of this part?"
- "Find the cylindrical faces and list their diameters and axes."
- "Measure wall thickness on these faces."
- "What is the minimum distance between this hole and the nearest wall?"
- "Measure draft relative to the +Z direction and list faces with negative draft."
- "Cut a section through this body at X = 40."
- "What changed between revision A and revision B?"

More examples, including DFM-style review prompts, are in
[docs/EXAMPLE_PROMPTS.md](https://github.com/ottonic/cad-mcp-server/blob/main/docs/EXAMPLE_PROMPTS.md).

## Tools

| Tool            | Returns                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect`       | Bounding-box dimensions, volume, surface area, body and assembly structure, B-rep health, and a revision-bound reference.                                                   |
| `find_entities` | Faces, edges, vertices, and bodies, with filters for surface type, radius, axis, and area.                                                                                  |
| `measure`       | Distance between faces, wall thickness, draft, ray casts, ray grids, point analysis, planar sections, and edge continuity.                                                  |
| `describe_pmi`  | Declared dimensions (nominal with deviations or bounds), geometric tolerances (value, zone, material modifier, datums), and datums, each with the entity IDs it applies to. |
| `diff`          | Dimension, volume, area, and topology deltas between two STEP revisions, declared PMI counts, and parsed STEP metadata.                                                     |

Measurement kinds are `distance`, `thickness`, `draft`, `ray`, `ray_grid`,
`point_analysis`, `section`, and `continuity`. Lengths come back in the file's
**declared unit**, labelled on every result, so an inch model stays in inches and
nothing has to be converted by hand. Angles are in degrees.

## Why the numbers hold up

- **Computed by Open CASCADE, not guessed.** The same file and the same query
  return the same numbers, every time.
- **Revision-bound and self-verifying.** Every result carries the entity IDs and
  the SHA-256 revision it came from, and stale IDs are rejected when a file changes
  underneath a session — so an answer can never be attached to the wrong geometry.
- **Reads the model's own callouts.** `describe_pmi` reports the dimensions,
  geometric tolerances, and datums a file declares, each bound to the entities it
  applies to, so declared requirements can be checked against the geometry.
- **Local and private.** It runs over stdio and reads files by path. It is
  read-only and never uploads or writes your CAD data.

## Requirements

- Node.js 26+
- Windows x64, macOS ARM64 (Apple Silicon), or Linux x64
- STEP files, as exported by SolidWorks, Fusion 360, Onshape, FreeCAD, CATIA, or
  any other CAD system

## FAQ

**Does it need CAD software installed?** No. It reads STEP files directly, so it
works on a machine without a CAD application or license.

**Do my files leave my machine?** No. The server runs locally over stdio and reads
files by path. It is read-only and never writes to your CAD data.

**How is this different from asking an assistant to look at a screenshot?**
Measurements are computed from the model's B-rep geometry by Open CASCADE, so the
same file and query return the same numbers. Each result also carries the entity
IDs and revision it came from.

## Development

Source setup, checks, packaging, and releases are in
[docs/DEVELOPMENT.md](https://github.com/ottonic/cad-mcp-server/blob/main/docs/DEVELOPMENT.md).
The server targets Windows x64, macOS ARM64, and Linux x64, and builds its native
sidecar from the pinned OCCT revision.

## Packaging

`npm pack` builds first and includes the compiled server, the native sidecar, this
README, and the third-party notices. Tests and source maps are excluded. Install
the tarball to check the `cad-mcp-server` executable with a compatible MCP client.

## Documentation

- [Example prompts](https://github.com/ottonic/cad-mcp-server/blob/main/docs/EXAMPLE_PROMPTS.md)
- [Architecture](https://github.com/ottonic/cad-mcp-server/blob/main/docs/ARCHITECTURE.md) — tools, workflow, and limits
- [Security](https://github.com/ottonic/cad-mcp-server/blob/main/docs/SECURITY.md) — local processing and handling CAD files as sensitive input
- [Changelog](https://github.com/ottonic/cad-mcp-server/blob/main/CHANGELOG.md)

## License

MIT. Third-party licenses: [THIRD_PARTY_NOTICES.md](https://github.com/ottonic/cad-mcp-server/blob/main/THIRD_PARTY_NOTICES.md).
