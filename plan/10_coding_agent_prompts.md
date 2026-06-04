# 10 — Coding Agent Prompts

Use these prompts with a coding agent to start implementation.

## Prompt 1 — Create repository scaffold

```text
Create a monorepo for a product called cad-copilot-mcp.

Use this structure:

apps/
  mcp-gateway/
  web-console/
  local-companion/

packages/
  cad-core/
  dfm-rules/
  report-generator/
  twin-store/
  company-knowledge/
  shared-types/

infra/
  docker/
  azure/

docs/
  product/
  architecture/
  api/

samples/
  step-files/
  reports/
  company-standards/

Set up TypeScript for gateway/shared packages and Python for cad-core if needed.
Add a README with local dev instructions.
Do not implement business logic yet. Create stubs and tests.
```

## Prompt 2 — Define shared schemas

```text
Create shared TypeScript types and JSON schemas for:

- CADFileMetadata
- TwinSnapshot
- GeometrySummary
- DetectedFeature
- DFMFinding
- DFMReviewResult
- HandoffReport
- ManufacturingProcess
- Severity

Add Zod schemas or JSON Schema validators.
Add unit tests for validation.
```

## Prompt 3 — Build CAD analysis CLI

```text
Build a CLI called cad-review with commands:

cad-review summarize <file>
cad-review dfm <file> --process cnc_milling
cad-review report <file> --process cnc_milling --out <path>

For now, implement a simple adapter around OpenCascade/pythonOCC or FreeCAD-headless.
If CAD parsing is not available in the environment, create a mock adapter with the same interface.

Outputs must be structured JSON.
Add sample fixtures and tests.
```

## Prompt 4 — Implement DFM rule engine

```text
Implement a rule engine for CNC manufacturability findings.

Start with rules:

- small_hole
- deep_hole_ratio
- thin_wall
- sharp_internal_corner
- tiny_fillet
- narrow_deep_pocket
- unknown_units
- missing_material
- missing_process

Rules should consume GeometrySummary and DetectedFeature[].
Each rule returns DFMFinding[].
Each finding must include severity, evidence, threshold, suggested fix, and confidence.
```

## Prompt 5 — Generate Markdown report

```text
Create a report generator that turns DFMReviewResult into a Markdown report.

Sections:

- Executive Summary
- Part Metadata
- Assumptions
- Top Findings
- Detailed Findings
- Suggested Fixes
- Supplier Questions
- Limitations

Include tables.
Use screenshot URLs if present.
Add snapshot tests.
```

## Prompt 6 — Build MCP gateway

```text
Create an MCP server exposing these tools:

- analyze_cad_file
- run_dfm_review
- generate_handoff_report
- get_cad_tutorial
- search_design_standards

For the first version, tools can use local file IDs and local sample docs.
Validate inputs and outputs.
Return structured JSON suitable for LLM orchestration.
Add integration tests using a simple MCP client.
```

## Prompt 7 — Company knowledge search

```text
Implement a local company knowledge service.

Input folder:
samples/company-standards/

Support Markdown and text initially.
Index documents.
Implement search_design_standards(query).
Return top cited excerpts with source file, title, and line/section info if available.
Keep it simple: keyword/BM25 is enough before vector search.
```

## Prompt 8 — CAD tutorial tool

```text
Implement get_cad_tutorial.

Inputs:
- cad_system
- version
- task
- company_context boolean

Use curated Markdown docs in samples/company-standards/cad-tutorials/.
Return:
- concise answer
- numbered steps
- warnings
- company notes with citations

Do not hallucinate unsupported menu paths. If docs are missing, say the answer is based on generic knowledge and mark confidence lower.
```

## Prompt 9 — Build web console

```text
Create a simple web console.

Features:
- upload/select sample CAD file
- run DFM review
- view findings table
- open Markdown report
- view JSON output
- manage sample company docs

Use a minimal UI. Do not overbuild auth yet.
```

## Prompt 10 — Local companion spike

```text
Create a Windows local companion spike.

Initial version:
- desktop or tray app
- user selects a local STEP file
- calls local cad-review CLI
- shows findings
- can optionally POST report JSON to gateway

Do not implement native CAD integration yet.
Prepare interfaces for future SOLIDWORKS/Fusion adapters.
```

## Prompt 11 — SOLIDWORKS adapter design

```text
Design but do not fully implement a SOLIDWORKS adapter.

Define interfaces:
- getInstalledVersion()
- getActiveDocumentMetadata()
- exportActiveDocumentAsStep()
- captureViewportScreenshot()
- getSelectedEntityContext()
- applyApprovedPatch(patch)

Document which methods require a SOLIDWORKS add-in vs standalone COM automation.
```

## Prompt 12 — Create end-to-end demo

```text
Create an end-to-end demo script:

1. Load sample STEP file.
2. Run analyze_cad_file.
3. Show DFM findings.
4. Search company standard for a related rule.
5. Generate handoff report.
6. Print a Copilot-style concise response.

The demo should run with one command:
npm run demo
or
make demo
```
