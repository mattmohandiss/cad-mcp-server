---
id: hole_classification
field: blind_hole_diameter
tolerance: 0
max_steps: 15
files:
  box: classify_hole_box.step
---

# Blind hole depth and wall stock

A 20mm-thick box contains two holes: a 6mm through-hole and an 8mm
blind hole, drilled 12mm deep.

What is the diameter and depth of the blind hole? Is the remaining
wall material beneath it thicker than 2mm?

Return JSON: {"blind_hole_diameter": number, "blind_hole_depth": number, "wall_passes_2mm": boolean}
