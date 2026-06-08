# Quick Reference: CAD MCP Server

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

## Available Tools

- `cad-mcp-server_inspect_step_file` -> fast first-pass overview
- `cad-mcp-server_analyze_step_detail` -> category-selected graph analysis
- `cad-mcp-server_query_step_graph` -> targeted graph queries
- `cad-mcp-server_compare_step_files` -> compare two STEP files
- `cad-mcp-server_generate_step_report` -> JSON plus Markdown report

## Test Prompts

1. Analyze `samples/NIST-PMI-STEP-Files/AP203 geometry only/nist_ftc_11_asme1_rb.stp` with `inspect_step_file`.
2. Run detailed geometry, topology, exchange, and health analysis on that file.
3. Query the graph for `hole_candidate` features.
4. Generate an `engineering_review` report.
5. Analyze `/nonexistent/file.step` to verify structured errors.

## Verify Success

- [ ] `just build` succeeds
- [ ] `just test` succeeds
- [ ] MCP server initializes
- [ ] MCP client can see the five tools
- [ ] Tool calls return `{ ok, data }` or `{ ok, error }`

## Files

| File | Purpose |
| --- | --- |
| `Tools.md` | Tool-surface and architecture guide |
| `dist/index.js` | Compiled MCP server |
| `samples/dummy.step` | Invalid geometry fixture for error tests |

## Current Provider Notes

- B-rep provider: `occt-wasm`
- AAG provider: unavailable by design until a real provider is integrated
- Semantic provider: lightweight STEP metadata parser

Next provider candidates: Analysis Situs for AAG/feature recognition and STP2OWL for formal OWL export.
