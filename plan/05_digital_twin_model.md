# 05 — Digital Twin / Shadow Model

## Purpose

The digital twin is a safe, program-agnostic shadow representation of a CAD file or live CAD session.

It lets the AI:

- inspect geometry without modifying native CAD
- run analysis repeatedly
- compare revisions
- generate screenshots and reports
- create what-if proposals
- eventually prepare native CAD patches for engineer approval

## Trust model

The AI should not directly mutate the engineer's live CAD file.

Recommended progression:

1. Read-only analysis.
2. Twin-only proposals.
3. Human-approved native CAD patches.
4. Optional automated changes for low-risk operations only.

## Twin object model

```ts
interface TwinSnapshot {
  id: string;
  tenant_id: string;
  project_id?: string;
  source: TwinSource;
  created_at: string;
  created_by: string;
  source_file_hash?: string;
  cad_system?: CADSystem;
  cad_version?: string;
  units: "mm" | "inch" | "unknown";
  material?: MaterialSpec;
  manufacturing_intent?: ManufacturingIntent;
  geometry: GeometryRefs;
  topology?: TopologySummary;
  assembly?: AssemblyTree;
  detected_features?: DetectedFeature[];
  screenshots?: ScreenshotRef[];
  findings?: DFMFinding[];
  company_rule_matches?: CompanyRuleMatch[];
  revision_parent_id?: string;
}
```

### `TwinSource`

```ts
type TwinSource =
  | { type: "uploaded_file"; file_id: string }
  | { type: "sharepoint_file"; drive_id: string; item_id: string }
  | { type: "local_companion"; device_id: string; session_id: string }
  | { type: "pdm_plm"; system: string; external_id: string };
```

### `GeometryRefs`

```ts
interface GeometryRefs {
  brep_ref?: string;      // Internal B-rep or serialized OpenCascade shape
  step_ref?: string;      // Neutral STEP representation
  mesh_ref?: string;      // GLB/OBJ/STL for viewer
  preview_image_ref?: string;
  bounding_box: [number, number, number];
  volume?: number;
  surface_area?: number;
  mass?: number;
}
```

### `DetectedFeature`

```ts
interface DetectedFeature {
  id: string;
  type:
    | "hole"
    | "thread"
    | "pocket"
    | "slot"
    | "rib"
    | "boss"
    | "fillet"
    | "chamfer"
    | "thin_wall"
    | "undercut"
    | "sheet_metal_bend"
    | "unknown";
  geometry_location: {
    body_id?: string;
    face_ids?: string[];
    edge_ids?: string[];
  };
  parameters: Record<string, string | number | boolean>;
  confidence: number;
}
```

## Twin branches

A twin can have branches for what-if proposals.

```text
Twin Rev A
  ├─ CNC Proposal 1
  ├─ Injection Molding Proposal 1
  └─ Lightweighting Proposal 1
```

Each branch stores:

- changed geometry
- change intent
- constraints
- before/after screenshots
- DFM delta
- risk delta
- approval state

## Proposal object

```ts
interface TwinProposal {
  id: string;
  base_twin_id: string;
  goal: string;
  constraints: string[];
  status: "draft" | "ready_for_review" | "approved" | "rejected" | "applied";
  changes: ProposedChange[];
  before_after_viewer_ref?: string;
  risk_delta?: RiskDelta;
  created_by: "ai" | "user";
  created_at: string;
}
```

## Proposed change types

Start with non-destructive annotations before geometry edits.

### Phase 1 change types

- add annotation
- suggest dimension change
- suggest material/process change
- suggest feature removal
- suggest radius increase
- suggest wall thickening

### Phase 2 change types

- increase fillet radius
- thicken wall
- move hole
- resize hole
- simplify pocket
- remove undercut
- add draft

### Phase 3 change types

- native CAD patch
- feature tree modification
- drawing callout update
- BOM metadata update

## Viewer artifacts

Generate:

- GLB mesh for browser-based 3D viewer
- PNG screenshots
- annotated screenshots
- face/edge highlight mapping
- issue overlays

Viewer requirements:

- click issue → highlight geometry
- click geometry → show issue/feature metadata
- show before/after proposals
- export screenshots into report

## Why this matters

The digital twin lets engineers ask:

- "What are the risks in this part?"
- "What if we switch from CNC to injection molding?"
- "What changed between Rev B and Rev C?"
- "Can you propose a more manufacturable version?"
- "Show me what you would change before touching my CAD file."

## MVP twin

For the MVP, keep the twin simple:

```ts
interface MvpTwin {
  id: string;
  source_file_hash: string;
  units: string;
  step_file_ref: string;
  mesh_file_ref?: string;
  preview_image_ref?: string;
  geometry_summary: Record<string, unknown>;
  detected_features: DetectedFeature[];
  findings: DFMFinding[];
}
```

Do not overbuild persistence before the CAD analysis works.
