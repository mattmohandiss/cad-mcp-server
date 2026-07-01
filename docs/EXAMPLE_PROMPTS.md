# Example Prompts

These are natural engineering questions you can ask your AI assistant when CAD MCP Server is connected. The assistant will use the right tools automatically — you just describe the problem.

## Design Review

> Review VortexParts.step like a mechanical lead before release. What are the top design or manufacturing risks I should resolve before sending this out?

> Find opportunities to reduce manufacturing cost without changing the product intent. Focus on geometry that increases machining time or supplier risk.

## Injection Molding

> Check if this part can eject cleanly from a two-part +Z mold. Flag any face with negative draft or less than 1 degree. Check minimum wall thickness around all holes — must be above 1.5mm.

## CNC Machining

> Build a first-pass CNC plan: likely setups, drilling directions, tooling constraints, and features that drive cost.

## 3D Printing

> Can these parts fit on a 200×200×300mm printer? What needs splitting or reorientation? Are there fragile features under 0.6mm?

## Revision Comparison

> Compare revision A and revision B. What changed, what risks does the change introduce, and what should be rechecked before tooling?

## Supplier Handoff

> Prepare an RFQ summary from VortexParts.step: part count, size envelope, complexity drivers, and questions the supplier will ask.

## Inspection Planning

> Create a first-pass inspection plan. What should QC measure? Which features are likely critical? What's missing from the model?

## Good Responses

A good assistant response should:

- Reference specific measurements from the model (dimensions, radii, face counts)
- Separate measured facts from engineering judgment
- Flag when the STEP file lacks material, tolerance, or process information
- Never invent tolerances, materials, or manufacturing certifications
