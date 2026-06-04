# 09 — MVP Build Plan

## MVP goal

Build a working prototype that lets a user ask a Copilot-compatible agent to:

1. answer CAD workflow questions,
2. analyze an uploaded STEP file for CNC manufacturability,
3. search company design-standard docs,
4. generate an engineering handoff report.

## Phase 0 — Spike

Goal:

Prove that the CAD pipeline can parse a STEP file and produce useful findings.

Tasks:

- Create sample repository.
- Add sample STEP files.
- Use OpenCascade/pythonOCC or FreeCAD-headless.
- Parse STEP.
- Compute bounding box, volume, surface area.
- Export mesh/preview image.
- Detect simple cylinders/holes.
- Generate Markdown summary.

Exit criteria:

- CLI command works:

```bash
cad-review analyze samples/bracket.step --process cnc_milling --out reports/bracket.md
```

## Phase 1 — CAD analysis CLI

Build:

```text
packages/cad-core
packages/dfm-rules
packages/report-generator
```

CLI commands:

```bash
cad-review summarize part.step
cad-review dfm part.step --process cnc_milling
cad-review report part.step --process cnc_milling --format markdown
```

Initial checks:

- file validity
- bounding box
- body count
- small holes
- deep holes
- sharp internal corners
- thin-wall heuristic
- tiny fillets
- narrow pockets if feasible

Exit criteria:

- produces JSON findings
- produces Markdown report
- findings include evidence and severity

## Phase 2 — MCP gateway

Build:

```text
apps/mcp-gateway
packages/shared-types
```

Tools:

- `analyze_cad_file`
- `run_dfm_review`
- `generate_handoff_report`
- `get_cad_tutorial`
- `search_design_standards`

For dev, use local file IDs or uploaded files.

Exit criteria:

- MCP client can call analysis tool
- returns structured JSON
- can generate report

## Phase 3 — Company knowledge prototype

Build:

```text
packages/company-knowledge
```

Start simple:

- local folder of Markdown/PDF/text docs
- vector or keyword search
- citations in results

Example docs:

- `company_standards/cnc_design_guide.md`
- `company_standards/threading_standard.md`
- `company_standards/drawing_checklist.md`

Exit criteria:

- `search_design_standards` returns cited excerpts
- DFM report can include relevant company rule references

## Phase 4 — Microsoft Copilot prototype

Build:

- declarative agent manifest
- MCP plugin configuration
- hosted MCP endpoint
- dev tunnel for local testing if needed

Agent use cases:

- "How do I add threading in SOLIDWORKS 2024?"
- "Review this STEP file."
- "Generate a supplier handoff report."

Exit criteria:

- Copilot agent can call your MCP server
- tool output is useful and concise

## Phase 5 — Web console

Build:

```text
apps/web-console
```

Features:

- upload CAD file
- run analysis
- view findings
- open report
- view screenshots/preview
- manage rule packs

This helps demo outside Copilot.

## Phase 6 — Local companion prototype

Build only after value is proven.

Minimum:

- Windows tray app or desktop app
- select local STEP file
- run local analysis
- optionally sync report JSON to gateway

Later:

- SOLIDWORKS add-in
- active document detection
- selected face/feature context
- local twin store

## Suggested weekly build plan

### Week 1

- Repo scaffold.
- CAD CLI.
- Parse STEP.
- Generate geometry summary.

### Week 2

- Initial CNC rules.
- Markdown reports.
- JSON schemas.

### Week 3

- MCP gateway.
- Tool endpoints.
- Sample MCP client tests.

### Week 4

- Company knowledge search.
- CAD tutorial prototype.
- Report citations.

### Week 5

- Microsoft Copilot agent prototype.
- Hosted gateway.
- Demo prompts.

### Week 6

- Improve screenshots/viewer.
- Add revision comparison.
- Prepare pilot demo.

## Demo script

1. User asks: "How do I add a threaded hole in SOLIDWORKS 2024?"
2. Agent gives concise tutorial and company standard note.
3. User uploads/selects STEP file.
4. User asks: "Review this for CNC manufacturability."
5. Agent returns top 5 risks with evidence.
6. User asks: "Generate a supplier handoff report."
7. Agent returns report link.
8. Optional: "Which company rule did this violate?"
9. Agent cites company design standard.

## Success metrics

Technical:

- analysis completes under 60 seconds for simple parts
- findings include screenshots/evidence
- no hallucinated measurements
- reports are usable

Product:

- engineer says at least one finding is useful
- engineer would send report to supplier or teammate
- company sees value without local install
- local companion is seen as an upgrade, not prerequisite
