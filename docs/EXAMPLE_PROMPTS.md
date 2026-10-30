# Example Prompts

Drop-in prompts for `cad-mcp` in any MCP host. The server returns deterministic
geometry facts; a domain capability — or you — can build DFM, materials, FEA, or
commercial recommendations on top of them.

## Model Overview

> Inspect this STEP file and report its bounding-box dimensions, volume, surface area, body count, B-rep validity, and face/edge counts.

## Face And Edge Discovery

> Find cylindrical faces in this STEP file and report their IDs, radii, and areas.

> Find circular edges with the smallest radius and return their IDs and measured radii.

## Measurement

> Find the faces I identify as the walls around these openings. Then measure thickness on those faces and report the values in millimetres. Do not decide whether the values meet a manufacturing requirement.

> Measure the minimum distance between these selected hole faces and wall faces. Return the closest entity pair and distance in millimetres.

> Measure draft relative to the +Z direction and identify faces with negative draft.

## Geometry Analysis

> Run a ray test from this face in the +Z direction and return the hit distances.

> Analyze this point against the selected face and return whether it is inside, on, or outside the face.

> Create a cross-section through this body using the supplied plane.

## Revision Comparison

> Compare these two STEP revisions. Report changes in overall dimensions, volume, surface area, and body/face/edge counts, plus any parsed STEP metadata differences. Do not infer design intent from the deltas.

## Host And Domain Composition

The following questions require a host or a specialized domain capability in addition to `cad-mcp`:

> Review this part for injection molding and explain whether the measured draft and wall thickness satisfy our process rules.

> Prepare a CNC quote-readiness review using the geometry facts, machine limits, tooling rules, and material information.

> Compare this model against the supplied drawing and identify dimensional or requirement mismatches.

> Prepare a supplier handoff using the measured complexity drivers and open questions.

## Response Requirements

A good host response should:

- Reference measured values and entity subjects.
- Separate geometry facts from engineering judgment.
- Preserve units and coordinate-system information.
- Identify model revision or source file.
- State when material, tolerance, process, drawing, or requirement information is missing.
- Never claim manufacturability, compliance, or safety from geometry alone.
