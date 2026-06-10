# MCP Tool Surface

## Purpose

This MCP gives AI assistants deterministic, read-only tools for querying STEP model facts. The server should measure and filter geometry; the AI should interpret the returned facts in user context.

The tools should not label geometry as a manufacturing defect, CAM problem, or design issue. They should return measured entities, candidate features, thresholds, evidence, and limitations.

## Multi-Turn Query Pattern

The query tools are optimized for multi-turn AI workflows:

1. Ask for `summary` (counts only) or `groups` (populations) first to understand a model without pulling a long entity list.
2. Drill into returned `sample_entity_ids`, regions, or nearby geometry with follow-up `entities` queries.
3. Request expensive fields with typed `include` values only when needed.

Common controls on query tools:

- `result_mode`: `summary`, `entities` (default), `groups`
- `limit` and `offset` for pagination
- `region` with bbox mode: `intersects`, `contained`, `contains_center`
- `near` with point and distance
- `group_by` with tool-specific enum values
- `sample_entity_limit` to cap representative IDs returned for each group

Every response includes `schema_version`, top-level `units`, `coordinate_system`, `statistics`, `pagination`, and compact `entities` and `groups` arrays.

### Grouping

Set `result_mode: "groups"` and provide `group_by` to aggregate matched entities into populations. Each group returns `entity_count`, a bounded `sample_entity_ids` array, `sample_entity_limit`, `sample_is_complete`, a `key` (the dimension values), and a `summary` (min/max of the grouped metric). Use the `key` and `sample_entity_ids` in follow-up `entities` queries to drill down.

Continuous dimensions use fixed, server-controlled bucket widths (the model does not pass tolerances):

- Size ranges (`area_range`, `length_range`, `depth_range`): log-scale bins in mm or mm^2 (`0-1`, `1-10`, `10-100`, `100-1000`, `1000-10000`, `10000+`). The `0-1` length bucket isolates tiny/degenerate edges.
- `radius` / `diameter`: rounded to the nearest 0.5 mm to separate standard sizes while merging floating-point noise.
- `normal_direction`: snapped to the nearest principal axis (`+X`..`-Z`) within 15 degrees, otherwise `off-axis`.

Recommended defaults:

- `result_mode`: `entities`
- `limit`: `100`
- `offset`: `0`
- `sample_entity_limit`: `5`; `0` means return no sample entity IDs
- `entities` and `groups`: always present as arrays; empty when not requested or not applicable

Notes:

- `result_mode: "groups"` without `group_by` groups by the tool's primary dimension (faces: `surface_type`, edges: `curve_type`, features: `feature_type`).
- Sample entity IDs are follow-up handles scoped to the same file and query context. They are not stable across separate imports or unrelated queries.
- **Multi-turn drill-down**: after a groups query returns `group_id` values, use `filter: { group_ids: ["group:0"] }` together with the same `group_by` to retrieve all entities in that group for further filtering. This is the intended way to move from population counts to individual entity inspection.

  Example flow:
  ```json
  // Step 1: count holes by diameter
  { "result_mode": "groups", "group_by": ["diameter"] }
  // → group:0 has 65 through-holes at diameter 6.0mm

  // Step 2: drill into that group
  { "group_by": ["diameter"], "filter": { "group_ids": ["group:0"] }, "limit": 200 }
  // → all 65 holes with entity-level detail
  ```

## Public Tools

The server exposes exactly five tools:

| Tool | Purpose |
| --- | --- |
| `inspect_step_file` | Fast file-level import, metadata, units, bounding box, counts, geometric properties, health, and limitations. |
| `query_step_faces` | Query B-rep faces/surfaces by configurable geometry filters, with grouping. |
| `query_step_edges` | Query B-rep geometric edges/curves by configurable geometry filters, with grouping. |
| `query_step_features` | Query derived feature candidates (through/blind holes, fillets, pockets), with grouping. |
| `compare_step_files` | Compare two STEP files by measured geometry, metadata, and topology counts. |

## Filter Semantics

Query tools combine filters using **AND logic across fields**. For example, `surface_type: ["plane"] AND area_min: 100` returns only planar faces with area >= 100.

However, **multi-value arrays within a single filter field use OR logic**. For example, `surface_type: ["plane", "cylinder"]` matches faces that are either planes **or** cylinders.

## `inspect_step_file`

Fast first-pass overview.

Input:

```json
{
  "file_path": "part.step"
}
```

Typical answers:

- Does the STEP file import?
- What units are assumed?
- What are the bounding box, dimensions, volume, and surface area?
- How many bodies, faces, and edges are present?
- What exchange metadata was detected?
- What obvious health or provider limitations exist?

## `query_step_faces`

Query B-rep faces and surfaces with deterministic filters.

Input:

```json
{
  "file_path": "part.step",
  "filter": {
    "entity_ids": ["face:12"],
    "group_ids": ["group:0"],
    "surface_type": ["plane", "cylinder", "bspline"],
    "area_min": 100,
    "area_max": 10000,
    "normal_parallel_to": [0, 0, 1],
    "normal_tolerance_degrees": 5
  },
  "region": {
    "bbox": {
      "min": [-10, -10, -10],
      "max": [10, 10, 10]
    },
    "mode": "intersects"
  },
  "near": { "point": [0, 0, 0], "distance": 25 },
  "include": ["area", "bbox", "center", "normal", "surface_parameters", "adjacent_faces"],
  "group_by": ["surface_type", "normal_direction"],
  "sort": { "by": "area", "direction": "desc" },
  "result_mode": "groups",
  "offset": 0,
  "limit": 200,
  "sample_entity_limit": 5
}
```

Supported `surface_type` values:

- `plane`
- `cylinder`
- `cone`
- `sphere`
- `torus`
- `bspline`
- `other`

Supported face `include` values:

- `id`, `surface_type`, `area`, `bbox`, `center`, `normal`, `surface_parameters`
- `adjacent_faces` — list of adjacent faces with `face_id`, `surface_type`, `vexity`, and `dihedral_angle_deg`. Computed on demand from OCCT kernel adjacency. Each face's entry describes one adjacent face pair with the dihedral angle across their shared edge. Typical box face has 4 adjacent faces.
- `closest_face_distance` — single `{face_id, distance}` giving the minimum `kernel.distanceBetween` to any other face in the model. Useful for wall thickness analysis (LLM decides what thickness threshold constitutes a "thin wall").

Supported face `group_by` values:

- `surface_type`, `normal_direction`, `area_range`, `radius`

Supported face sort fields:

- `area`, `surface_type`, `center_x`, `center_y`, `center_z`

## `query_step_edges`

Query B-rep geometric edges and curves. These are model edges, not knowledge-graph relationship edges.

Input:

```json
{
  "file_path": "part.step",
  "filter": {
    "entity_ids": ["edge:594"],
    "group_ids": ["group:0"],
    "curve_type": ["line", "circle", "bspline", "other"],
    "length_min": 0,
    "length_max": 1
  },
  "region": {
    "bbox": {
      "min": [-10, -10, -10],
      "max": [10, 10, 10]
    },
    "mode": "intersects"
  },
  "near": { "point": [-39.8, 48.1, -350], "distance": 10 },
  "include": ["length", "curve_type", "bbox", "center", "radius", "start_point", "end_point", "adjacent_faces"],
  "group_by": ["curve_type", "length_range"],
  "sort": { "by": "length", "direction": "asc" },
  "result_mode": "groups",
  "offset": 0,
  "limit": 200,
  "sample_entity_limit": 5
}
```

Supported `curve_type` values:

- `line`
- `circle`
- `ellipse`
- `bspline`
- `other`

Supported edge `include` values:

- `id`, `curve_type`, `length`, `bbox`, `center`, `radius`, `start_point`, `end_point`
- `adjacent_faces` — the two faces that bound this edge, each with `face_id` and `surface_type`. Computed by reverse-lookup from OCCT face sub-shapes. Manifold edges always have exactly 2 bounding faces.

Supported edge `group_by` values:

- `curve_type`, `length_range`

Supported edge sort fields:

- `length`, `curve_type`, `radius`, `center_x`, `center_y`, `center_z`

## `query_step_features`

Query derived feature candidates. These are evidence-backed candidates, not native CAD feature-tree facts and not manufacturing issue labels.

Input:

```json
{
  "file_path": "part.step",
  "feature_type": ["through_hole_candidate", "blind_hole_candidate", "fillet_candidate"],
  "filter": {
    "entity_ids": ["feature:0"],
    "group_ids": ["group:0"],
    "radius_min": 2,
    "radius_max": 8,
    "through": true,
    "axis_parallel_to": [0, 0, 1],
    "confidence_min": 0.5
  },
  "region": {
    "bbox": {
      "min": [-100, -100, -100],
      "max": [100, 100, 100]
    },
    "mode": "contains_center"
  },
  "include": ["parameters", "bbox", "axis", "source_faces", "confidence"],
  "group_by": ["diameter", "through"],
  "result_mode": "groups",
  "offset": 0,
  "limit": 200,
  "sample_entity_limit": 5
}
```

Supported `feature_type` values:

- `hole_candidate` - undetermined hole (use through filter to distinguish)
- `through_hole_candidate` - hole goes all the way through the body
- `blind_hole_candidate` - hole stops inside the body
- `fillet_candidate` - rounded edge
- `pocket_candidate` - depression or pocket

Supported feature `include` values:

- `id`, `feature_type`, `parameters`, `bbox`, `center`, `axis`, `source_faces`, `confidence`

Supported feature `group_by` values:

- `feature_type`, `diameter`, `radius`, `depth_range`, `through`

Supported feature sort fields:

- `radius`, `diameter`, `depth`, `confidence`, `center_x`, `center_y`, `center_z`

## `compare_step_files`

Compare two STEP files by measured facts.

Input:

```json
{
  "file_a": "old.step",
  "file_b": "new.step"
}
```

Important limitation:

This tool should not claim stable feature, face, or edge identity across separate STEP imports unless a future provider explicitly supports that.

## Evidence Rules

Every non-trivial returned entity or candidate should include, where available:

- entity IDs
- measured values
- units
- threshold/filter used
- bounding box or center point
- source faces or source edges
- confidence for candidates
- provider and method
- limitations

Good labels:

- `short_edge` when it means "edge length below the requested threshold"
- `through_hole_candidate` / `blind_hole_candidate` when describing hole type
- `cylindrical_face`
- Feature candidates with confidence scores for heuristic-based detection

Avoid labels:

- `bad_hole`
- `unmachinable_face`
- `manufacturing_defect`
- `problem_surface`
- `too_small` without an explicit user-provided threshold
