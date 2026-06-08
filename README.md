# CAD MCP Server

A local MCP server for read-only STEP CAD analysis. The server converts STEP files into an AI-facing CAD knowledge graph with measured facts, feature candidates, exchange metadata, warnings, limitations, and provider provenance.

## Quick Start

```bash
just setup
just build
npm start
```

Run validation:

```bash
just check
just build
```

## Architecture

```text
MCP tools
  -> CAD application services
  -> CadKnowledgeGraph
  -> BRepProvider / AagProvider / SemanticProvider
  -> STEP files
```

The architecture is provider-neutral:

- `BRepProvider` supplies exact geometry/topology facts. Current implementation: `occt-wasm`.
- `AagProvider` supplies face adjacency and feature-recognition graph facts. Current implementation: explicitly unavailable until a real AAG provider is integrated.
- `SemanticProvider` supplies STEP exchange metadata and OWL-like facts. Current implementation: lightweight STEP text/header parser.

## Available Tools

The MCP server exposes five tools.

### `inspect_step_file`

Fast first-pass overview with geometry, exchange metadata, health warnings, and provider limitations.

```json
{
  "file_path": "/path/to/model.step"
}
```

### `analyze_step_detail`

Category-selected analysis over the canonical CAD knowledge graph.

```json
{
  "file_path": "/path/to/model.step",
  "categories": ["geometry", "topology", "features", "exchange", "health"],
  "detail_level": "summary"
}
```

Valid categories: `geometry`, `topology`, `structure`, `features`, `spatial`, `exchange`, `health`.

Valid detail levels: `summary`, `standard`, `full`.

### `query_step_graph`

Deterministic graph query interface for follow-up questions.

```json
{
  "file_path": "/path/to/model.step",
  "query": {
    "find": "features",
    "where": { "type": "hole_candidate" }
  }
}
```

### `compare_step_files`

Compares two STEP files using metric, metadata, feature-count, and health/risk deltas.

```json
{
  "file_a": "/path/to/old.step",
  "file_b": "/path/to/new.step"
}
```

### `generate_step_report`

Generates structured JSON sections plus a Markdown report.

```json
{
  "file_path": "/path/to/model.step",
  "report_type": "engineering_review"
}
```

Report types: `engineering_review`, `supplier_review`, `import_risk`, `space_claim`, `manufacturing_handoff`, `pmi_audit`.

## Response Shape

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "type": "file_not_found|invalid_format|parse_error|unknown",
    "message": "..."
  }
}
```

Tool outputs separate:

- `facts`: directly measured or parsed values.
- `inferences`: feature/spatial/health candidates with evidence.
- `warnings`: suspicious conditions and risks.
- `limitations`: what current providers cannot prove.
- `providers`: provider capabilities and limitations.

## Project Structure

```text
src/
  index.ts
  tools/                 # MCP tool handlers
  cad/                   # graph builder, projections, query, compare, report
  providers/             # provider interfaces and implementations
  utils/                 # generic errors, IDs, numeric helpers
  tests/                 # integration fixtures and tests
```

## Current Limitations

- AAG is intentionally marked unavailable until Analysis Situs or another AAG provider is integrated.
- Feature candidates from `occt-wasm` are heuristic B-rep hints, not feature-tree intent.
- STEP exchange parsing is lightweight and does not perform full OWL/EXPRESS/PMI interpretation.
- `compare_step_files` reports metric and metadata deltas; it does not infer stable feature identity across revisions.

## References

- [MCP Protocol](https://modelcontextprotocol.io/)
- [OpenCascade Documentation](https://dev.opencascade.org/doc/overview/html/)
- [STEP Format](https://en.wikipedia.org/wiki/ISO_10303)
