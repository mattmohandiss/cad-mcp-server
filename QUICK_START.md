# Quick Start

## Setup

```bash
just setup
just build
```

## Run Tests

```bash
just test
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
- `cad-mcp-server_query_step_faces`: configurable B-rep face/surface query schema. Kernel-backed implementation is pending.
- `cad-mcp-server_query_step_edges`: configurable B-rep edge/curve query schema. Kernel-backed implementation is pending.
- `cad-mcp-server_query_step_features`: configurable derived feature-candidate query schema. Kernel-backed implementation is pending.
- `cad-mcp-server_compare_step_files`: metric-level comparison of two STEP files.

## Sample File

Use this included NIST STEP fixture for manual testing:

```text
samples/NIST-PMI-STEP-Files/AP203 geometry only/nist_ftc_11_asme1_rb.stp
```

The sample corpus includes AP203 and AP242 files. Some AP242 files include PMI, but this MCP currently performs only lightweight PMI/entity detection, not full semantic PMI interpretation.

## Test Prompts

1. Inspect the NIST sample with `inspect_step_file`.
2. Confirm `query_step_faces`, `query_step_edges`, and `query_step_features` expose strict schemas; these return `not_implemented` until kernel-backed implementation lands.
3. Query examples should use candidate-oriented feature values such as `hole_candidate`, `cylindrical_region`, `fillet_candidate`, or `pocket_candidate`.
4. Keep query examples summary-first with `limit`, `offset`, and typed `include` values.
5. Compare two sample STEP files with `compare_step_files` and treat the result as a metric-level comparison.
6. Inspect `/nonexistent/file.step` to verify structured errors.

## Verify Success

- `just build` succeeds.
- `just test` succeeds.
- MCP server initializes.
- MCP client can see the five tools.
- Tool calls return `{ "ok": true, "data": ... }` or `{ "ok": false, "error": ... }`.
- Tool output includes provider limitations where analysis is heuristic or incomplete.

## Provider Notes

- B-rep provider: `occt-wasm`.
- Topology/feature provider: internal AAG-style analysis derived from `occt-wasm` topology calls.
- Semantic provider: lightweight STEP text/header parser.

Important limitations:

- No full native OCCT API surface.
- No exposed BRepGraph API from `occt-wasm`.
- No authoritative feature-tree, PMI/GD&T, or revision-identity claims.
