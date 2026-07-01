---
id: thin_walls
field: thinnest_hole_diameter
tolerance: 0
max_steps: 12
files:
  box_with_holes: box_with_3_holes.step
---

# Thin wall detection

The box with three holes has known diameters of 5mm, 10mm, and 15mm.
The holes are drilled at X=0, X=15, and X=-15, all at Y=0 through the
full 20mm depth.

A wall thickness below 2mm is a manufacturing concern for this part.
Use ray tests from each cylindrical face along its axis (both directions)
to measure the minimum distance from the hole surface to the nearest
box face in the radial direction.

Report:

1. Which hole (by diameter) has the thinnest wall around it
2. The minimum wall thickness found (in mm)
3. Whether the part passes the 2mm minimum wall specification

Return JSON: {"thinnest_hole_diameter": number, "min_wall_mm": number, "passes_2mm_spec": boolean}
