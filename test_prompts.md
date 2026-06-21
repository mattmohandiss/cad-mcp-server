# Test Prompts

Each prompt tests a specific capability. Prompts are ordered by increasing complexity.
"Expected" describes the tool calls an ideal LLM should make, not the only valid approach.

---

# Level 1: Basic inspection

**Prompt 1** — "Open VortexParts.step and summarize what's in it."

- **Expected**: `inspect_step_file`
- Should return ~28 bodies. LLM identifies part names, total volume, face/edge counts.
- **Good sign**: LLM names specific parts (Core, FrameA, FrameB, Casing, Counterweights).
- **Failure**: Returns only "model" without decomposition.

**Prompt 2** — "The core has a toothed belt section. Can you find any indicator of that in the geometry?"

- **Expected**: `find_step_edges` with `curve_types: ["line"], sort_by: "length", sort_direction: "asc", limit: 50`
- Or: summary with `length_max` to catch tiny edges.
- **Good sign**: LLM finds many tiny edges (<1mm), notes dense clusters = likely gear teeth.
- **Failure**: Only inspects and says "looks solid."

---

# Level 2: Feature analysis

**Prompt 3** — "What size cylindrical faces does the model contain? Group them by radius."

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], return_type: "groups", group_by: ["radius"]`
- **Good sign**: LLM reports radius clusters at ~2mm (M4 clearance), ~3mm (6mm rod channels), 7.5mm/30mm (6015 bearing bore/OD), 23.5mm/34mm (6804 bearing).
- **Failure**: Searches edges with `curve_types: ["circle"]` instead of faces — gets edge lengths, not hole radii.
- **Watch for**: LLM hallucinates bolt/hole sizes without data. Let the data speak.

**Prompt 4** — "Which part in the assembly has the most tiny faces under 1mm²?"

- **Expected**: `find_step_faces` with `area_max: 1, group_by: ["body_id"], return_type: "groups"`
- **Good sign**: LLM identifies body with most small faces, cross-references with part name. Likely the Core (toothed section) or the Jig.
- **Failure**: Only returns total count across all bodies, doesn't name the body.

**Prompt 5** — "Find the 6mm carbon fiber rod channels — describe their location and dimensions."

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], radius: { min: 2.9, max: 3.1 }`
- **Follow-up**: Check face bboxes for length ~225mm.
- **Good sign**: LLM finds faces at radius ~3mm, reports their bounding boxes span ~225mm in one axis.
- **Failure**: LLM can't parse radius into a search and just lists all cylinders.

**Prompt 6** — "What are the bearing bore diameters in the model?"

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], radius: { min: 7, max: 35 }, return_type: "summary"`
- Then narrow to likely bearing radii (7.5mm, 23.5mm, 30mm, 34mm).
- **Good sign**: LLM finds ~7.5mm and ~15mm (6015: 15mm ID / 60mm OD), 23.5mm and 34mm (6804: 47mm ID / 68mm OD).
- **Failure**: LLM says "I can't determine bearing sizes from geometry data."

---

# Level 3: Cross-referencing with description

**Prompt 7** — "The slip ring uses parts ASL9013 and ABH6004S. Can you find which bodies those might be and describe their geometry?"

- **Expected**: `inspect_step_file` to list body names → `find_step_faces` on those specific bodies.
- **Good sign**: LLM scans body names, identifies likely candidates, describes their size and face types.
- **Failure**: Body names are opaque (e.g., "Body_001"), LLM gives up.

**Prompt 8** — "The counterweights hold 1/2 oz lead sinkers. What can you tell me about the pocket geometry?"

- **Expected**: `find_step_faces` on counterweight bodies with `surface_types: ["cylinder"]`
- **Good sign**: LLM finds small cylindrical pockets, reports radius, estimates volume / number of sinkers.
- **Failure**: LLM says "can't determine without visual inspection."

---

# Level 4: Change detection

**Prompt 9** — "Compare VortexParts_revA.step and VortexParts_revB.step — what changed?"

- **Expected**: `compare_step_files`
- **Good sign**: Returns volume/area deltas, edge/face count changes. LLM interprets: "revision B is 4.2% lighter, likely from shelling the core."
- **Failure**: LLM says "dimensions changed" but gives no interpretation.

---

# Level 5: Multi-step reasoning with geometry

**Prompt 10** — "The casing is a truncated 300mm sphere. Is that consistent with the geometry in the file?"

- **Expected**: `inspect_step_file` for bounding box → 300mm-ish in at least one axis.
- Then: `find_step_faces` with `surface_types: ["bspline", "torus"]` on the casing body.
- **Good sign**: LLM finds large curved faces, compares bbox to 300mm sphere, says "yes, consistent" or "the bbox is 304×302×210 — consistent with a truncated sphere."
- **Failure**: LLM tries to calculate curvature from edge data and fails.

**Prompt 11** — "Plan the CNC setup: list every unique drilling direction across the whole assembly."

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], fields: ["id", "surface_parameters"]` → extract axis direction from each cylindrical face → group by direction vector.
- **Good sign**: LLM reports unique axes (e.g. "+Z: 12 holes, -Z: 8 holes, +X: 4 holes, -Y: 2 holes") and flags multi-axis requirements.
- **NOTE**: This requires `surface_parameters.axis` to be populated (╠WIP — needs `getFaceCylinderAxis` in occt-wasm fork).
- **Failure**: LLM tries `group_by: ["normal_direction"]` — cylinder normals vary per point on surface, giving garbage.
- **Blocker removed**: Once `group_by: ["axis"]` is available on `find_step_faces`, this becomes a single call.

**Prompt 12** — "A resin printer has 200×200×300mm build volume. Which parts won't fit and what's the best workaround?"

- **Expected**: `inspect_step_file` for bounding box → 274×274×412mm overall.
- **Good sign**: LLM notes model exceeds build volume, identifies largest bodies, suggests splitting the core or reorienting the casing.
- **Limitation**: No per-body bounding box endpoint — LLM may struggle to say exactly which part exceeds. Note this as a gap.

---

# Level 6: DFM / Manufacturing analysis

*(Some of these require planned tools; mark expected behavior with available tools)*

**Prompt 13** — "What are the smallest internal corner radii in the Core body?"

- **Expected**: `find_step_edges` with `curve_types: ["circle"], body_ids: ["body:0"], sort: { by: "radius", direction: "asc" }`
- **Good sign**: LLM reports the minimum radius found, notes that smaller radii need smaller end mills (higher cost, slower feeds).
- **Failure**: Only searches all bodies, doesn't narrow to Core.

**Prompt 14** — "Are there any through-holes in the casing, and what diameters?"

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], body_ids: ["body:<casing>"], fields: ["id", "surface_parameters", "adjacent_faces", "has_inner_wires"]`
- LLM identifies through-holes by checking: does the cylindrical face belong to a hole that exits the part? (Look at adjacent faces on both ends.)
- **Good sign**: LLM correctly distinguishes through-holes from blind holes using adjacency + UV bounds.
- **Failure**: LLM assumes every cylindrical face is a through-hole.

**Prompt 15** — "Could this part be made with just 3-axis machining, or would it need 4th/5th axis?"

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"], fields: ["id", "surface_parameters"]` → compare all cylinder axis directions → if all axes are parallel (or antiparallel), 3-axis is feasible; otherwise need multi-axis.
- **Good sign**: LLM reports "All holes are along Z — 3-axis is fine" or "Holes exist in 3 different directions — need 4th axis or multiple setups."
- **Failure**: LLM doesn't check axis direction and guesses.

**Prompt 16** — "Can a standard 10mm end mill reach all the features in this part?"

- **Expected**: `find_step_edges` with `curve_types: ["circle"], sort: { by: "radius", direction: "asc" }` → check smallest internal corner radius ≥ 5mm (half of 10mm end mill).
- Then: `find_step_faces` with `surface_types: ["cylinder"], group_by: ["radius"]` → assess hole diameters accessible with 10mm tool.
- **Good sign**: LLM flags features where corner radius <5mm or hole diameter <10mm, lists them as needing smaller tool.
- **Failure**: LLM says "yes" without checking data.

---

# Level 7: Higher-level manufacturing reasoning

*(These test the LLM's ability to synthesize multiple tool calls into practical advice)*

**Prompt 17** — "What would be the optimal orientation for fixturing this part during CNC machining?"

- **Expected**: `inspect_step_file` for bbox + body count → identify largest flat faces via `find_step_faces` with `surface_types: ["plane"], sort: { by: "area", direction: "desc" }` → check if any faces are datums via `query_step_pmi` → suggest fixturing against the largest datum-referenced planar face.
- **Good sign**: LLM considers: largest flat face for vacuum or vise, datums for alignment, hole directions for tool access.
- **Failure**: LLM picks a random face without justification.

**Prompt 18** — "The design calls for ±0.1mm on most features and ±0.02mm on bearing bores. Is the drawing consistent with the model?"

- **Expected**: `query_step_pmi` → find tightest tolerances → compare to stated requirements → flag mismatches.
- **Good sign**: LLM reports "found ±0.02mm on bore faces — matches requirement" or "no PMI data found in STEP file (AP203) — cannot verify."
- **Failure**: LLM invents tolerance values.

**Prompt 19** — "Does this part have any undercuts that would complicate molding?"

- **Expected**: `find_step_faces` with `surface_types: ["cylinder"]`, get axis directions → compare to principal draw direction. If any cylinder axis is not parallel to the draw direction, it's an undercut.
- **Good sign**: LLM identifies specific cylindrical features that would act as undercuts, suggests side-actions or core pulls.
- **Failure**: LLM says "no undercuts found" without checking.

---

# Error recovery / edge cases

**Prompt 20** — "Find all the faces near the point 42, 50, -100."

- **Expected**: LLM says "I don't have a spatial search filter" or adapts by inspecting body bboxes.
- **Should NOT**: LLM sends `near: { point: [42,50,-100], distance: ... }` — that field is removed.
- **Failure**: LLM hallucinates a result or sends an invalid parameter.

**Prompt 21** — "Show me the edges with radius between 2 and 5."

- **Expected**: LLM sends `find_step_edges` with `radius: { min: 2, max: 5 }` (nested object, only applies to circular edges).
- **Should NOT**: LLM sends `radius_min: 2, radius_max: 5` (old flat format).
- **Failure**: Stale schema in LLM context causes Zod parse error. If this happens, the error message itself (with correct field names) should let it self-correct on retry.

**Prompt 22** — (No specific model loaded) "Generate a 50mm x 30mm x 10mm plate with four 5mm through-holes at the corners."

- **Expected**: LLM says "This server can inspect/query STEP files but cannot create or modify geometry."
- **Failure**: LLM hallucinates a modeling capability.
