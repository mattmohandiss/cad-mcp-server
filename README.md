# CAD MCP Server

A minimal MCP (Model Context Protocol) server for analyzing STEP CAD files locally with OpenCascade compiled to WebAssembly.

## Quick Start

### Setup

```bash
just setup
```

### Run Integration Tests

```bash
just test
```

### Start the MCP Server

```bash
just build
npm start
```

This starts the MCP server that listens for tool calls on stdin/stdout.

### Build

```bash
just build
```

## Architecture

```
MCP Client → MCP Server (Node.js) → OpenCascade WASM → STEP Files
```

## Available Tools

The MCP server exposes 3 tools:

### 1. `analyze_step_file`

Analyze a STEP file and extract basic geometry information.

**Input:**
```json
{
  "file_path": "/path/to/file.step"
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "filePath": "...",
    "units": "mm",
    "boundingBox": { "min": {...}, "max": {...} },
    "dimensions": { "width": ..., "height": ..., "depth": ... },
    "volume": 1234.56,
    "surfaceArea": 567.89,
    "bodyCount": 1,
    "shapeType": "complex",
    "summary": "..."
  }
}
```

### 2. `list_bodies`

List all bodies in a STEP file with their properties.

**Input:**
```json
{
  "file_path": "/path/to/file.step"
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "filePath": "...",
    "bodyCount": 1,
    "bodies": [
      {
        "index": 0,
        "volume": "1234.56",
        "surfaceArea": "567.89",
        "boundingBox": { "min": {...}, "max": {...} },
        "features": {
          "hasHoles": true,
          "hasFillets": true
        },
        "summary": "..."
      }
    ]
  }
}
```

### 3. `extract_edges`

Extract edge information from a STEP file.

**Input:**
```json
{
  "file_path": "/path/to/file.step"
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "filePath": "...",
    "totalEdgeCount": 24,
    "statistics": {
      "averageLength": "12.34",
      "minLength": "1.23",
      "maxLength": "45.67"
    },
    "detectedFeatures": {
      "hasHoles": true,
      "hasFillets": true
    },
    "edgeLengthRanges": {
      "tiny": 0,
      "small": 3,
      "medium": 15,
      "large": 6,
      "xlarge": 0
    },
    "summary": "..."
  }
}
```

## Project Structure

```
cad-mcp/
  src/
    index.ts              # MCP server entry point
    tools/
      analyze.ts          # analyze_step_file implementation
      bodies.ts           # list_bodies implementation
      edges.ts            # extract_edges implementation
    utils/
      cad-analyzer.ts     # Analyzer backend (re-exports occt-cad)
      occt-cad.ts         # OpenCascade WASM analyzer
      schema.ts           # TypeScript types
    tests/
      integration.test.ts # Integration tests
  samples/
    dummy.step            # MCP plumbing fixture, not real geometry
  justfile                # Task runner
  package.json
  tsconfig.json
```

## Implementation Details

### CAD Analysis

The analyzer uses `occt-wasm`, which packages OpenCascade as WebAssembly and runs inside Node.js.

The included `samples/dummy.step` file is a minimal STEP metadata fixture for MCP plumbing tests and should not be used as a geometry correctness fixture.

### Error Handling

All errors are returned as JSON with the structure:

```json
{
  "success": false,
  "error": "Error message",
  "type": "file_not_found|invalid_format|parse_error|unknown"
}
```

## Next Steps

- Connect to Claude Desktop or another MCP client
- Continue expanding STEP regression fixtures
- Add more DFM (Design For Manufacturing) rules
- Implement design standards search
- Add web console UI

## References

- [MCP Protocol](https://modelcontextprotocol.io/)
- [OpenCascade Documentation](https://dev.opencascade.org/doc/overview/html/)
- [STEP Format](https://en.wikipedia.org/wiki/ISO_10303)
