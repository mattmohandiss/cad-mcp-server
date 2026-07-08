---
id: thin_walls
field: thinnest_hole_diameter
tolerance: 0
max_steps: 12
files:
  block: thinwall_block.step
---

# Thin wall detection

This box has three through-holes, all through the full 20mm depth. A
wall thickness below 2mm is a manufacturing concern.

Find the hole with the thinnest surrounding wall. Report its diameter,
the minimum wall thickness found, and whether the part passes the 2mm
minimum wall specification.

Return JSON: {"thinnest_hole_diameter": number, "min_wall_mm": number, "passes_2mm_spec": boolean}
