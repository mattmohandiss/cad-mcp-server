# CAD Copilot MCP Product Docs

This folder contains a technical product blueprint for a Microsoft Copilot-compatible engineering assistant for mechanical design teams.

## Product thesis

Build an **engineering context layer for Microsoft Copilot** that gives AI assistants reliable CAD-aware tools:

- CAD file analysis
- manufacturing-risk detection
- company design-standard lookup
- version-specific CAD software help
- engineering handoff report generation
- optional local CAD companion for live CAD context
- optional digital twin/shadow model for safe what-if edits

The product should not start as "another chatbot." It should start as a **tool server** that existing AI systems can call.

## Recommended MVP

Start with a no-install Microsoft-compatible agent:

1. Microsoft Copilot / Copilot Studio entry point.
2. Remote MCP gateway.
3. STEP/PDF/DXF file analysis.
4. CNC-focused DFM checks.
5. Company design-standard search.
6. Handoff report generation.
7. Optional local companion later.

## Document map

| File | Purpose |
|---|---|
| `01_product_brief.md` | Product definition, target users, wedge, and scope |
| `02_system_architecture.md` | Overall architecture and deployment modes |
| `03_microsoft_copilot_integration.md` | How to make this Microsoft Copilot-compatible |
| `04_mcp_tools_spec.md` | Proposed MCP tools, resources, and prompts |
| `05_digital_twin_model.md` | Shadow model / digital twin design |
| `06_cad_processing_pipeline.md` | CAD parsing, feature extraction, DFM checks, reports |
| `07_local_companion_app.md` | Optional Windows/CAD companion architecture |
| `08_security_and_enterprise.md` | Security, permissions, IP handling, auditability |
| `09_mvp_build_plan.md` | Phased implementation plan |
| `10_coding_agent_prompts.md` | Prompts/tasks to give a coding agent |
| `11_open_questions.md` | Questions to resolve before/while building |
| `12_sources.md` | Current technical references |

## Suggested repository structure

```text
cad-copilot-mcp/
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
    azure/
    docker/
  docs/
    product/
    architecture/
    api/
  samples/
    step-files/
    reports/
    prompts/
```

## Initial technical bias

Use this stack unless there is a strong reason not to:

- TypeScript/Node or Python for the MCP gateway.
- Python/C++ bindings for CAD geometry work.
- OpenCascade / pythonOCC / FreeCAD-headless for early STEP support.
- SQLite/Postgres for metadata.
- Object storage for uploaded CAD, meshes, screenshots, and reports.
- Three.js-compatible GLB/mesh output for viewer artifacts.
- Markdown/HTML first for reports; PDF export later.
