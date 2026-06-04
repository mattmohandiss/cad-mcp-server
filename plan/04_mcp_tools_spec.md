# 04 — MCP Tools Specification

This document defines the proposed MCP tools, resources, and prompts.

## Design principles

1. Tool outputs must be structured.
2. Geometry claims must come from deterministic tools.
3. LLM should not invent measurements.
4. Every finding should include evidence.
5. All risky write operations require explicit human approval.
6. Start read-only.

## Tool groups

### CAD context

- `get_supported_formats`
- `get_cad_file_metadata`
- `get_current_cad_context`
- `create_twin_snapshot`

### Geometry analysis

- `summarize_geometry`
- `extract_features`
- `measure_wall_thickness`
- `detect_holes`
- `detect_deep_pockets`
- `detect_sharp_internal_corners`
- `detect_draft_angle_issues`
- `detect_undercuts`
- `compare_revisions`

### Manufacturing checks

- `run_dfm_review`
- `run_cnc_review`
- `run_sheet_metal_review`
- `run_additive_review`
- `run_injection_molding_review`

### Company knowledge

- `search_design_standards`
- `search_supplier_capabilities`
- `lookup_approved_part`
- `check_company_rule_compliance`

### Reports

- `generate_handoff_report`
- `generate_design_review_checklist`
- `generate_supplier_questions`
- `export_report`

### Tutorials

- `get_cad_tutorial`
- `get_version_specific_command_help`
- `diagnose_cad_workflow_issue`

### Future write/proposal tools

- `propose_twin_change`
- `compare_twin_proposals`
- `prepare_native_cad_patch`
- `apply_approved_cad_patch`

## Core types

### `ManufacturingProcess`

```ts
type ManufacturingProcess =
  | "cnc_milling"
  | "turning"
  | "sheet_metal"
  | "additive_fdm"
  | "additive_sls"
  | "additive_sla"
  | "injection_molding"
  | "casting"
  | "welding_assembly"
  | "unknown";
```

### `Severity`

```ts
type Severity = "info" | "low" | "medium" | "high" | "critical";
```

### `DFMFinding`

```ts
interface DFMFinding {
  id: string;
  type: string;
  title: string;
  severity: Severity;
  confidence: number;
  manufacturing_process: ManufacturingProcess;
  geometry_location?: {
    body_id?: string;
    face_ids?: string[];
    edge_ids?: string[];
    feature_ids?: string[];
  };
  evidence: {
    measurement?: string;
    threshold?: string;
    rule_id?: string;
    screenshot_url?: string;
    viewer_url?: string;
  };
  why_it_matters: string;
  suggested_fix: string;
  citations?: Array<{
    source_id: string;
    title: string;
    url?: string;
    excerpt?: string;
  }>;
}
```

## Tool specs

### `analyze_cad_file`

Purpose:

Analyze an uploaded or referenced CAD file.

Input:

```json
{
  "file_id": "string",
  "manufacturing_process": "cnc_milling",
  "material": "6061 aluminum",
  "supplier_profile_id": "default",
  "include_screenshots": true,
  "include_report": true
}
```

Output:

```json
{
  "analysis_id": "analysis_123",
  "summary": "Part is generally machinable but has 4 medium-risk features.",
  "geometry_summary": {
    "units": "mm",
    "bounding_box": [120, 70, 35],
    "volume_mm3": 120000,
    "surface_area_mm2": 8200,
    "body_count": 1
  },
  "findings": [],
  "report_url": "https://...",
  "viewer_url": "https://..."
}
```

### `run_dfm_review`

Purpose:

Run a specific manufacturing-process rule pack on an existing twin snapshot.

Input:

```json
{
  "twin_id": "twin_123",
  "manufacturing_process": "cnc_milling",
  "material": "6061 aluminum",
  "rule_pack_id": "cnc_basic_v1"
}
```

Output:

```json
{
  "review_id": "review_123",
  "status": "complete",
  "finding_count": 8,
  "findings": []
}
```

### `get_cad_tutorial`

Purpose:

Answer workflow questions for a specific CAD tool/version.

Input:

```json
{
  "cad_system": "SOLIDWORKS",
  "version": "2024",
  "task": "create a threaded hole",
  "company_context": true
}
```

Output:

```json
{
  "answer": "Use Hole Wizard rather than modeled threads unless actual thread geometry is required.",
  "steps": [
    "Open Hole Wizard.",
    "Choose tapped hole.",
    "Select the standard and thread size.",
    "Place the hole on the target face.",
    "Add the drawing callout."
  ],
  "warnings": [
    "Do not model helical threads unless needed for manufacturing, rendering, or 3D printing."
  ],
  "company_notes": [
    {
      "source": "Company CAD Standard",
      "note": "Preferred practice is cosmetic thread callouts for standard tapped holes."
    }
  ]
}
```

### `search_design_standards`

Purpose:

Search internal standards with citations.

Input:

```json
{
  "query": "minimum internal corner radius for CNC aluminum parts",
  "project_id": "optional",
  "cad_context_id": "optional"
}
```

Output:

```json
{
  "results": [
    {
      "source_id": "doc_123",
      "title": "CNC Design Guide",
      "excerpt": "Internal radii should match available tooling...",
      "url": "https://..."
    }
  ]
}
```

### `generate_handoff_report`

Purpose:

Generate a supplier-facing or internal handoff report.

Input:

```json
{
  "analysis_id": "analysis_123",
  "audience": "supplier",
  "format": "markdown",
  "include_screenshots": true,
  "include_open_questions": true
}
```

Output:

```json
{
  "report_id": "report_123",
  "report_url": "https://...",
  "summary": "Report generated with 8 findings and 4 supplier questions."
}
```

### `create_twin_snapshot`

Purpose:

Create a neutral shadow representation from file or local CAD session.

Input:

```json
{
  "source_type": "file",
  "source_id": "file_123",
  "include_mesh": true,
  "include_features": true,
  "include_screenshots": true
}
```

Output:

```json
{
  "twin_id": "twin_123",
  "status": "created",
  "viewer_url": "https://...",
  "geometry_summary": {}
}
```

### `propose_twin_change`

Purpose:

Create a safe what-if proposal against the twin, not the native CAD file.

Input:

```json
{
  "twin_id": "twin_123",
  "goal": "make this part easier to machine on a 3-axis CNC mill",
  "constraints": [
    "preserve mounting hole positions",
    "preserve outer envelope",
    "keep material 6061 aluminum"
  ]
}
```

Output:

```json
{
  "proposal_id": "proposal_123",
  "status": "created",
  "changes": [
    {
      "type": "increase_fillet_radius",
      "target": "edge_group_12",
      "from": "0.5 mm",
      "to": "2.0 mm",
      "reason": "Matches standard end mill radius and reduces machining risk."
    }
  ],
  "before_after_viewer_url": "https://...",
  "requires_approval": true
}
```

## MCP resources

Expose resources such as:

```text
cad://twin/{twin_id}/summary
cad://twin/{twin_id}/mesh
cad://analysis/{analysis_id}/findings
cad://report/{report_id}
company://standard/{standard_id}
company://supplier/{supplier_id}/capabilities
```

## MCP prompts

Reusable prompts:

- `review_for_cnc_manufacturing`
- `review_for_sheet_metal`
- `prepare_supplier_handoff`
- `compare_design_revisions`
- `answer_cad_tutorial_question`
- `check_against_company_standard`
- `propose_more_manufacturable_design`

Example prompt:

```text
Run a CNC manufacturability review on the provided CAD file.
Call CAD analysis tools first.
Do not invent measurements.
Rank findings by severity.
For each finding include evidence, why it matters, suggested fix, and confidence.
Generate a handoff report if the user asks for one.
```
