# Quick Start

## Setup

```bash
just setup
just build
```

## Validate

```bash
just check
```

## Start The MCP Server

```bash
npm start
```

For local development with TypeScript directly:

```bash
npm run dev
```

## Available Tools

- `cad-mcp-server_inspect_step_file`: fast first-pass STEP overview.
- `cad-mcp-server_find_step_faces`: search and group B-rep faces.
- `cad-mcp-server_find_step_edges`: search and group B-rep edges.
- `cad-mcp-server_get_step_entities`: retrieve exact known face/edge IDs.
- `cad-mcp-server_query_step_pmi`: lightweight PMI/GD&T, dimension, datum, and annotation query.
- `cad-mcp-server_compare_step_files`: metric-level comparison of two STEP files.

## Suggested Manual Flow

1. Call `inspect_step_file` on a STEP file.
2. Call `find_step_faces` or `find_step_edges` with `return_type: "summary"` or `"groups"`.
3. Drill into returned IDs with `get_step_entities`.
4. Request `adjacent_faces` only when local topology is needed.
5. Use `query_step_pmi` when checking dimensions, tolerances, datums, or annotations.

## Verify Success

- `just check` succeeds.
- MCP server initializes.
- MCP client can see six tools.
- Tool calls return `{ "ok": true, "data": ... }` or `{ "ok": false, "error": ... }`.

## Provider Notes

- Geometry backend: `occt-wasm`.
- Model cache: in-memory cache keyed by resolved path, size, and mtime.
- Metadata/PMI backend: lightweight STEP text parser.

Important limitations:

- No full native OCCT API surface.
- No authoritative CAD feature-tree or design-history recovery.
- No authoritative PMI/GD&T validation.
- No stable feature identity across revisions.
- Full-model adjacency is not computed during default inspection; local adjacency is opt-in.
