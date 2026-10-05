# Example Prompts

These prompts are useful when `cad-mcp` is connected to an MCP host. The server returns deterministic geometry facts. A separate domain capability may interpret those facts as DFM, materials, FEA, or commercial recommendations.

## Model Overview

> Inspect this STEP file and report its dimensions, volume, body/face/edge counts, validity, topology, and available PMI information.

## Face And Edge Discovery

> Find all cylindrical faces and report their radii, areas, axes, and body IDs.

> Find the smallest fillet radius and return the affected edge IDs with measurements.

## Measurement

> Find the thinnest wall section around these faces and report the measured values in millimeters.

> Measure the clearance between these holes and the nearest wall. Return the closest pair and the measured distance.

> Measure draft relative to the +Z direction and identify faces with negative draft.

## Geometry Analysis

> Run a ray test from this face in the +Z direction and return the hit distances.

> Analyze this point against the selected face and return whether it is inside, on, or outside the face.

> Create a cross-section through this body using the supplied plane.

## Revision Comparison

> Compare these two STEP revisions and report changes in dimensions, volume, surface area, and topology counts.

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
