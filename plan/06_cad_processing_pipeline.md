# 06 — CAD Processing Pipeline

## Goal

Turn CAD inputs into trustworthy engineering findings.

```text
Input CAD/Drawing
  ↓
Import / Normalize
  ↓
Geometry Representation
  ↓
Feature Extraction
  ↓
DFM Rule Checks
  ↓
Screenshots / Viewer
  ↓
Structured Findings
  ↓
Report
```

## Initial supported inputs

MVP:

- STEP/STP
- STL
- PDF drawings
- DXF if easy

Later:

- SLDPRT / SLDASM
- Fusion
- Inventor
- NX
- Creo
- CATIA
- native PDM/PLM references

## Why STEP first

STEP is the practical first neutral CAD format for file-based analysis.

It is not perfect because it may lose native feature-tree/design-intent information, but it is usually good enough for:

- geometry summary
- holes
- pockets
- fillets
- wall thickness
- bounding box
- mass properties
- manufacturability checks

## Processing stages

### 1. File intake

Tasks:

- validate file type
- virus scan if enterprise/cloud
- compute file hash
- store original file
- infer units
- collect user-provided process/material info

Metadata:

```json
{
  "file_name": "bracket_rev_b.step",
  "file_hash": "sha256...",
  "units": "mm",
  "source": "upload",
  "material": "6061 aluminum",
  "target_process": "cnc_milling"
}
```

### 2. CAD import

Use geometry kernel to import the file.

Early choices:

- OpenCascade / pythonOCC
- FreeCAD headless
- CAD Exchanger or commercial translator later

Outputs:

- B-rep object
- topology graph
- bodies/faces/edges
- triangulated mesh
- preview images

### 3. Geometry summary

Compute:

- bounding box
- volume
- surface area
- mass if material density known
- body count
- shell/solid validity
- center of mass
- principal axes if useful

### 4. Feature extraction

Detect:

- holes
- counterbores/countersinks
- cylindrical bosses
- slots
- pockets
- thin walls
- ribs
- fillets
- chamfers
- sharp internal corners
- draft angles
- undercuts
- inaccessible faces

Feature extraction should include confidence.

Do not overclaim. Use:

```text
"hole-like cylindrical feature"
```

if you cannot prove it is a native Hole Wizard feature.

### 5. DFM checks

Initial CNC rules:

- tiny holes
- deep holes
- high depth-to-diameter ratio
- narrow/deep pockets
- sharp internal corners
- very small internal radii
- inaccessible undercuts
- thin walls
- thin ribs
- high aspect ratio slots
- tiny features below tool capability
- nonstandard thread sizes if metadata available
- missing material/process assumptions

Each finding should include:

- severity
- evidence
- threshold
- process affected
- suggested fix
- screenshot
- confidence

Example:

```json
{
  "type": "deep_pocket",
  "severity": "medium",
  "evidence": "Pocket depth 32 mm, width 4 mm",
  "threshold": "Depth/width ratio > 4 flagged",
  "why_it_matters": "May require long-reach tooling and increase chatter risk.",
  "suggested_fix": "Increase width, reduce depth, or allow alternate tooling.",
  "confidence": 0.78
}
```

### 6. Screenshot and viewer generation

For every finding, generate at least one visual artifact:

- part overview
- highlighted face/edge
- close-up view
- before/after for proposals

Viewer outputs:

- GLB mesh
- JSON issue overlay
- screenshot PNGs

### 7. Report generation

Report sections:

1. Executive summary.
2. Part metadata.
3. Assumptions.
4. Top risks.
5. Detailed findings.
6. Suggested fixes.
7. Open supplier questions.
8. Limitations.
9. Appendix with measurements.

## Rules engine design

Represent DFM rules as data where possible.

```yaml
id: cnc.deep_hole_ratio.v1
process: cnc_milling
title: Deep hole risk
description: Flags holes where depth-to-diameter ratio exceeds configured threshold.
inputs:
  - detected_holes
parameters:
  max_depth_to_diameter_ratio: 6
severity:
  medium_above: 6
  high_above: 10
suggested_fix: Increase diameter, reduce depth, or specify specialized drilling process.
```

## Separating deterministic checks from LLM output

Good:

```text
Tool: "Hole diameter is 2 mm and depth is 18 mm."
LLM: "This is a 9:1 depth-to-diameter ratio, which may increase drill wander risk."
```

Bad:

```text
LLM invents hole dimensions from visual appearance.
```

## MVP DFM checks

Start with these:

1. geometry validity
2. bounding box and mass properties
3. small holes
4. deep holes
5. thin walls
6. sharp internal corners
7. tiny fillets
8. narrow/deep pockets
9. unreachable undercuts heuristic
10. report generation

## Known technical challenges

- STEP units can be messy.
- Imported topology may not preserve feature names.
- Wall thickness is nontrivial.
- Accurate tool-access analysis can become complex.
- Native CAD intent is usually lost in neutral files.
- Assemblies are harder than parts.
- Drawings and GD&T extraction can be a separate product.
