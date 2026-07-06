---
id: hole_classification
field: blind_hole_diameter
tolerance: 0
max_steps: 15
files:
  box_with_blind_hole: box_with_blind_hole.step
---

# Blind hole depth and wall stock

A 20mm-thick box contains two holes: an 8mm through-hole and a 12mm
blind hole, drilled 8mm deep.

What is the diameter and depth of the blind hole? Is the remaining
wall material beneath it thicker than 2mm?

Return JSON: {"blind_hole_diameter": number, "blind_hole_depth": number, "wall_passes_2mm": boolean}
