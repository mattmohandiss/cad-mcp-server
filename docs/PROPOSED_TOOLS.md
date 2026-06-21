# Proposed MCP Tools

Design principle: **MCP provides factual geometry data. The LLM does analysis and interpretation.** Tools should expose raw geometric properties that are expensive or impossible for the LLM to compute with existing tools — not pre-baked answers.

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Live | Shipped and working |
| 🔧 In fork | C++ change done, wasm rebuild needed |
| 📋 Planned | Requirements clear, waiting implementation |
| 💭 Future | Needs more research, may not build |

---

## Level 1: Raw inspection (what IS this part?)

| Tool | Status | What it returns | What it enables |
|------|--------|-----------------|-----------------|
| `inspect_step_file` | ✅ Live | Body count, names, volume, bbox, topology counts | First-pass part overview |
| `find_step_faces` | ✅ Live | Faces by surface type, area, body, normal | Search for specific feature types |
| `find_step_edges` | ✅ Live | Edges by curve type, length, radius | Tiny edge detection, circular features |
| `get_step_entities` | ✅ Live | Full details on known face/edge IDs | Drill into specific features |
| `query_step_pmi` | ✅ Live | Tolerances, datums, dimensions, annotations | GD&T analysis |
| `compare_step_files` | ✅ Live | Volume/area deltas, topology count changes | Revision diffing |

## Level 2: Feature identification (what features does it HAVE?)

These expose geometric properties that LLMs cannot efficiently infer.

### Hole / cylinder features

| Capability | Status | What it returns | What it enables |
|------------|--------|-----------------|-----------------|
| Cylinder radius | ✅ Live | mm radius | Hole size identification |
| Cylinder axis direction + location | 🔧 In fork | `{ direction: [dx,dy,dz], location: [lx,ly,lz] }` | Drilling direction, coaxial grouping |
| `group_by: ["axis"]` on faces | 📋 Planned | Groups coaxial cylindrical faces | "How many unique drilling directions?" |
| Through vs blind hole detection | 📋 Planned | Classification per cylindrical face | "Is this a through-hole or blind hole?" |

### Distance / clearance

| Capability | Status | What it returns | What it enables |
|------------|--------|-----------------|-----------------|
| `measure_distance(file, entityA, entityB)` | 📋 Planned | `{ distance, pointA, pointB }` | Wall thickness, pocket depth, gap analysis |
| Entity spec: `face:N`, `edge:N`, or `[x,y,z]` | 📋 Planned | — | Flexible distance queries |

### Thin wall detection

| Capability | Status | What it returns | What it enables |
|------------|--------|-----------------|-----------------|
| `find_thin_walls(file, max_thickness)` | 💭 Future | Face pairs closer than threshold | DFM wall thickness check, distortion risk |
| OCCT: iterate parallel face pairs via `BRepExtrema` | 💭 Future | — | — |

### Corner radius analysis

| Capability | Status | What it returns | What it enables |
|------------|--------|-----------------|-----------------|
| Edge search with radius filter | ✅ Live | Circular edges by radius | Find fillet radii |
| Concave vs convex classification | 💭 Future | Edge concavity flag | Distinguish fillets from rounds |
| Smallest internal corner radius | 💭 Future | Minimum concave edge radius | Tool size selection for machining |

### Draft / undercut analysis

| Capability | Status | What it returns | What it enables |
|------------|--------|-----------------|-----------------|
| Draft angle per face | 💭 Future | `{ face_id, surface_type, angle_from_principal }` | Undercut detection, moldability |
| Accessibility from principal directions | 💭 Future | Per-face "reachable from ±X/±Y/±Z" | 3-axis vs multi-axis determination |

---

## Level 3: What the LLM should answer (no new tools needed)

These are analysis questions the LLM can answer once Level 2 data is available. **Do not build tools for these** — they are reasoning tasks.

| Question | Primitives needed |
|----------|-------------------|
| "What are the unique drilling directions?" | Cylinder axis data + `group_by: ["axis"]` |
| "Is this a counterbore / countersink?" | Coaxial cylinder pairs with different radii + adjacency |
| "Can this be 3-axis machined?" | Unique feature directions against principal axes |
| "Is this feature a pocket?" | Planar bottom + adjacent planar walls with shared edges |
| "What's the optimal clamping orientation?" | Datum faces + largest planar faces |
| "How many setups would this part need?" | Feature direction grouping + axis data |
| "What is the minimum wall thickness?" | `measure_distance` between parallel face pairs |
| "Is this casting-friendly?" | Draft angles, uniform wall thickness, fillet radii |
| "Does this design have stress risers?" | Sharp internal corners, thin-to-thick transitions |
| "What standard tool sizes match this feature?" | Hole diameters, corner radii, slot widths |

---

## Level 4: What the LLM cannot answer alone (needs external context)

These require specifications, standards, or domain knowledge the model may not have. The MCP should not attempt these — the LLM should say "I need more information" and ask the user.

| Question | Why LLM can't answer |
|----------|---------------------|
| "Is this material selection appropriate?" | No load/temperature/environment data |
| "Will this part survive fatigue?" | No load cycles, stress data, or FEA results |
| "Does this meet our internal design standards?" | No access to company-specific standards |
| "Is this tolerance achievable with our supplier?" | No supplier capability data |
| "Does this design meet regulatory requirements?" | Industry/region-specific regulations |
| "Why was this feature shaped this way?" | No design intent documentation |

---

## Implementation roadmap

### Phase 1: Current — Cylinder axis data (🔧 In fork)
- `getFaceCylinderAxis(faceId)` in OCCT facade: `gp_Ax1` → `{ direction, location }`
- Wire into `surface_parameters.axis` in face queries
- Add `group_by: ["axis"]` to `find_step_faces`

### Phase 2: Next — Distance measurement (📋 Planned)
- `measure_distance(file, entityA, entityB)` → `{ distance, pointA, pointB }`
- Entities: `face:N`, `edge:N`, or inline `[x, y, z]`
- OCCT: `BRepExtrema_DistShapeShape` (~ms per call)

### Phase 3: Future — Feature classification (💭 Future)
- Through/blind hole classification
- Thin wall detection
- Concave/convex edge classification
- Draft angle detection

### Never build
- "Is this design good?" tools
- FEA / simulation
- Cost estimation
- Material recommendation
- Design rationale answers
