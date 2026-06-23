# Example Prompts

These prompts are designed for mechanical engineers using CAD MCP Server through an AI assistant. They ask for engineering work products, not raw geometry dumps.

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
Review this part for injection molding feasibility using a simple two-part mold assumption. Where are the likely undercuts, side-action needs, or geometry that should be redesigned?
```

```text
Can these parts be printed on a 200 x 200 x 300 mm printer? Tell me what fits, what probably needs splitting or reorientation, and what geometry may be fragile or hard to print.
```

## Supplier Handoff

```text
Prepare an RFQ summary for a machine shop from VortexParts.step: part count, approximate size envelope, complexity drivers, tolerance/PMI availability, and questions the supplier will likely ask.
```

```text
Create a first-pass inspection plan from the STEP file. What should QC measure, which features are likely critical, and what information is missing from the model?
```

## Revision And Fit Checks

```text
Compare VortexParts_revA.step and VortexParts_revB.step as an ECO review. What changed, what risks does the change introduce, and what should be rechecked?
```

```text
Audit the model for bearing and shaft interfaces. Identify likely bores, rod channels, and bearing seats, then tell me what dimensions or tolerances need verification before ordering hardware.
```

## Assembly Review

```text
Review the assembly for practical assembly/service issues. Look for repeated fastener or bearing features, access directions, fragile features, and anything that could make assembly error-prone.
```

## Good Assistant Behavior

- Use CAD MCP tools to gather measured facts before making recommendations.
- Separate measured facts, assumptions, and engineering recommendations.
- Cite specific model evidence such as dimensions, radii, body IDs, face/edge groups, PMI presence, or revision deltas.
- Say when the STEP file lacks material, tolerance, process, quantity, or authoritative PMI information.
- Do not invent feature-tree intent, material, fit class, tolerance values, or manufacturability certification.
