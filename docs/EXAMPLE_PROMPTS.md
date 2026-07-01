# Example Prompts

These prompts are designed for mechanical engineers using CAD MCP Server through an AI assistant. They ask for engineering work products, not raw geometry dumps.

The tool workflow: `inspect_step` for overview → `query_faces` / `query_edges` to find features → `measure_step` for measurements → `diff_step` for revisions.

## Design Review

```text
Review VortexParts.step like a mechanical lead before release. What are the top design or manufacturing risks I should resolve before sending this out?
```

```text
Find opportunities to reduce manufacturing cost without changing the product intent. Focus on geometry that increases machining time, inspection burden, or supplier risk.
```

## Manufacturing Planning

```text
Assume I want to CNC machine these parts. Build a first-pass manufacturing plan: likely setups, drilling directions, tooling constraints, and the features that will drive cost.
```

```text
Review this part for injection molding feasibility using a simple two-part mold assumption. Use measure_step with draft_angle to check draft angles, query_faces for wall thickness candidates, and measure_step with ray_test_grid for actual wall measurements. Where are the likely undercuts or side-action needs?
```

```text
Can these parts be printed on a 200×200×300mm printer? Tell me what fits, what needs splitting or reorientation, and what geometry may be fragile or hard to print.
```

## Supplier Handoff

```text
Prepare an RFQ summary for a machine shop from VortexParts.step: part count, approximate size envelope, complexity drivers, tolerance/PMI availability, and questions the supplier will likely ask.
```

```text
Create a first-pass inspection plan from the STEP file. What should QC measure, which features are likely critical, and what information is missing from the model?
```

## Revision and Fit Checks

```text
Compare VortexParts_revA.step and VortexParts_revB.step as an ECO review. Use diff_step to identify what changed. What risks does the change introduce, and what should be rechecked?
```

```text
Audit the model for bearing and shaft interfaces. Use query_faces to identify likely bores and bearing seats by surface_type and radius, then tell me what dimensions need verification before ordering hardware.
```

## Wall Thickness Analysis

```text
Check the wall thickness around every hole in this part. Use query_faces with surface_type cylinder to find all holes, then measure_step with op ray_test_grid and direction along_axis_both to measure the minimum wall around each hole. Flag any hole with less than 2mm wall thickness.
```

## Draft Angle Analysis

```text
Check if this part can eject cleanly from a two-part mold with +Z pull direction. Use query_faces with surface_type cylinder and surface_type plane to find all faces, then measure_step with op draft_angle and direction [0,0,1] on each face. Flag any face with negative draft (undercut) or less than 1 degree of draft.
```

## Good Assistant Behavior

- Use `inspect_step` first for model overview, then `query_faces` or `query_edges` to find specific features.
- Use `measure_step` for measurements — pass entity IDs from prior queries.
- Batch measure: pass multiple entity IDs to `measure_step` in one call.
- Separate measured facts, assumptions, and engineering recommendations.
- Cite specific model evidence such as dimensions, radii, face IDs, or revision deltas.
- Say when the STEP file lacks material, tolerance, process, or authoritative PMI information.
- Do not invent feature-tree intent, material, fit class, tolerance values, or manufacturability certification.
