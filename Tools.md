# MCP Tool Surface

This server exposes read-only tools for factual STEP inspection. The tools measure and filter geometry; the assistant interprets the results in engineering context.

## Workflow

Use tools from cheap to specific:

1. `inspect_step_file` for file-level overview, validity, size, body count, topology counts, and PMI hints.
2. `find_step_faces` or `find_step_edges` with `return_type: "summary"` or `"groups"` to understand populations.
3. `find_step_faces` or `find_step_edges` with filters and small `limit` values to get candidate entity IDs.
4. `get_step_entities` for exact known IDs and requested fields.
5. Request adjacency fields only when local topology is needed.

Repeated calls on the same file reuse a cached imported model keyed by resolved path, size, and mtime.

## Tools

| Tool | Purpose |
| --- | --- |
| `inspect_step_file` | Fast first-pass overview. Defers expensive face area extremes and adjacency. |
| `find_step_faces` | Search faces by surface type, area, normal direction, body, region, proximity, grouping, and area sort. |
| `find_step_edges` | Search edges by curve type, length, circular radius, body, region, proximity, grouping, and length/radius sort. |
| `get_step_entities` | Fast exact lookup for known `face:N` or `edge:N` IDs. |
| `query_step_pmi` | Lightweight PMI/GD&T, dimension, datum, and annotation query from STEP text. |
| `compare_step_files` | Whole-model metric and metadata deltas between two STEP files. |

## Query Responses

Face, edge, entity, and PMI query responses include:

- `schema_version`
- `file_path`
- `units`
- `coordinate_system`
- `query`
- `statistics`
- `pagination`
- `entities`
- `groups`
- `warnings`
- `limitations`

Use `limit` and `offset` for pagination. Use `return_type: "summary"` for counts only, `"groups"` for grouped populations, and `"entities"` for paginated entity rows.

## Face Fields

Common face fields:

- `id`
- `surface_type`
- `area`
- `bbox`
- `bbox_center`
- `normal`
- `surface_parameters`
- `has_inner_wires`
- `body_id`
- `adjacent_faces`
- `closest_face_distance`

`adjacent_faces` and `closest_face_distance` are intentionally opt-in.

## Edge Fields

Common edge fields:

- `id`
- `curve_type`
- `length`
- `bbox`
- `bbox_center`
- `radius`
- `start_point`
- `end_point`
- `body_id`
- `adjacent_faces`

Radius filters match radius-bearing/circular edges only.

## Limitations

- The server does not infer native CAD feature trees or design intent from STEP.
- PMI parsing is lightweight and does not validate GD&T semantic correctness.
- Full-model adjacency graphs are not built during default inspection; local adjacency is computed on demand.
- Revision comparison uses whole-model metrics and metadata, not stable feature identity.
