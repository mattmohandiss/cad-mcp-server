# Test Prompts

These prompts evaluate whether an LLM can turn raw CAD facts into useful engineering work.
They are intentionally high-level: the user asks for a decision, review, or work product, not a geometry dump.

"Expected" describes the tool strategy an ideal LLM should use. It is not the only valid approach.

---

## 1. Engineering Release Review

**Prompt** - "Review `VortexParts.step` like a mechanical lead before release. What are the top design or manufacturing risks I should resolve before sending this out?"

- **Expected**: Start with `inspect_step_file`, then use `find_step_faces`, `find_step_edges`, and `query_step_pmi` to investigate high-risk geometry: very small faces/edges, many small radii, unusual body count, missing PMI, tight cylindrical fits, and complex curved faces.
- **Good sign**: Produces a prioritized risk list with evidence, such as "no PMI found, so bearing bore tolerances cannot be verified," "many sub-1mm faces on body X may indicate tiny teeth or fragile geometry," or "small internal radii may force small tooling."
- **Failure**: Summarizes model dimensions and topology only, without saying what matters for release readiness.

## 2. CNC Manufacturing Plan

**Prompt** - "Assume I want to CNC machine these parts. Build a first-pass manufacturing plan: likely setups, drilling directions, tooling constraints, and the features that will drive cost."

- **Expected**: Use `inspect_step_file`, cylindrical face queries with axis fields, large planar face queries for fixturing surfaces, and edge radius searches for minimum cutter constraints.
- **Good sign**: Groups holes/features by axis direction, identifies whether one setup or multiple setups are likely, calls out smallest internal corner radii, and ties findings to tooling and fixturing choices.
- **Failure**: Says "CNC is possible" without checking hole axes, planar datum candidates, or minimum radii.

## 3. Supplier RFQ Summary

**Prompt** - "Prepare an RFQ summary for a machine shop from `VortexParts.step`: part count, approximate size envelope, complexity drivers, tolerance/PMI availability, and questions the supplier will likely ask."

- **Expected**: Use `inspect_step_file` for model/bodies/dimensions, `find_step_faces` and `find_step_edges` for complexity indicators, and `query_step_pmi` for drawing/tolerance availability.
- **Good sign**: Generates a supplier-facing summary that separates known facts from open questions, e.g. material, finish, quantity, critical dimensions, and missing tolerance data.
- **Failure**: Produces a generic RFQ checklist without using any model evidence.

## 4. Revision Change Review

**Prompt** - "Compare `VortexParts_revA.step` and `VortexParts_revB.step` as an ECO review. What changed, what risks does the change introduce, and what should be rechecked?"

- **Expected**: Use `compare_step_files` first, then investigate changed risk areas with face/edge searches if the deltas suggest added complexity, material removal, new holes, or changed topology.
- **Good sign**: Translates deltas into engineering consequences, such as weight reduction, new small features, changed fit geometry, or additional manufacturing operations.
- **Failure**: Reports only numeric volume/area/topology deltas without interpreting impact.

## 5. Bearing And Shaft Fit Audit

**Prompt** - "Audit the model for bearing and shaft interfaces. Identify likely bores, rod channels, and bearing seats, then tell me what dimensions or tolerances need verification before ordering hardware."

- **Expected**: Search cylindrical faces grouped by radius, inspect candidate body names/locations, retrieve axis and bbox details, and query PMI for dimensions/tolerances.
- **Good sign**: Identifies likely fit features by radius clusters and geometry span, reports diameters as measured facts, and flags missing or insufficient PMI for press/slip fits.
- **Failure**: Claims compatibility with specific hardware without supporting bore diameters or tolerances.

## 6. 3D Printing Build Assessment

**Prompt** - "Can these parts be printed on a 200 x 200 x 300 mm printer? Tell me what fits, what probably needs splitting or reorientation, and what geometry may be fragile or hard to print."

- **Expected**: Use `inspect_step_file` for envelope and body count, then query small faces/edges and large/curved faces to identify fragile details and likely support-heavy geometry.
- **Good sign**: Separates whole-assembly envelope from per-part uncertainty, identifies likely oversize bodies where possible, and calls out small features that may fail depending on process.
- **Failure**: Gives a yes/no answer based only on the total assembly bounding box.

## 7. Moldability And Undercut Review

**Prompt** - "Review this part for injection molding feasibility using a simple two-part mold assumption. Where are the likely undercuts, side-action needs, or geometry that should be redesigned?"

- **Expected**: Use `inspect_step_file`, large planar/normal searches to infer candidate draw directions, and cylindrical face axis data to find features not aligned with the draw direction.
- **Good sign**: Clearly states the assumed draw direction, lists evidence-backed candidate undercuts or cross-holes, and avoids claiming a complete moldflow/draft analysis.
- **Failure**: Says the part is moldable or not moldable without declaring assumptions or checking feature directions.

## 8. Cost Reduction Opportunities

**Prompt** - "Find opportunities to reduce manufacturing cost without changing the product intent. Focus on geometry that increases machining time, inspection burden, or supplier risk."

- **Expected**: Query tiny faces/edges, smallest radii, many radius groups, complex surfaces, multi-axis hole directions, and PMI/tolerance availability.
- **Good sign**: Recommends specific changes tied to evidence, such as increasing minimum internal radii, standardizing hole sizes, reducing small decorative features, or adding PMI for critical fits.
- **Failure**: Gives generic advice like "simplify geometry" without model-specific evidence.

## 9. Inspection And QA Plan

**Prompt** - "Create a first-pass inspection plan from the STEP file. What should QC measure, which features are likely critical, and what information is missing from the model?"

- **Expected**: Use `query_step_pmi` for explicit dimensions/datums/tolerances, inspect cylindrical features for fits, and find large planar/cylindrical features likely to act as datums or functional interfaces.
- **Good sign**: Distinguishes explicit PMI from inferred critical features, proposes inspection targets, and flags when the STEP file lacks authoritative tolerances.
- **Failure**: Invents datum schemes or tolerance values that are not present.

## 10. Assembly And Serviceability Review

**Prompt** - "Review the assembly for practical assembly/service issues. Look for repeated fastener or bearing features, access directions, fragile features, and anything that could make assembly error-prone."

- **Expected**: Use `inspect_step_file` for body structure, grouped cylindrical faces for repeated fastener/bearing sizes, cylinder axis data for access directions, and small-feature queries for fragile details.
- **Good sign**: Produces an actionable assembly review: repeated hardware families, likely access constraints, possible alignment or service issues, and follow-up questions.
- **Failure**: Only lists part names or counts and does not connect geometry to assembly workflow.

---

## Evaluation Principles

- The best answers make engineering decisions from factual geometry, not just restate tool output.
- Good answers separate measured facts, assumptions, and recommendations.
- Good answers explain uncertainty when STEP lacks PMI, materials, process, quantity, or functional requirements.
- Bad answers hallucinate tolerances, material, fit class, process capability, or feature intent without evidence.
- The tools are read-only. If a prompt asks for geometry creation or modification, the model should say the server can inspect/query STEP files but cannot edit CAD.
