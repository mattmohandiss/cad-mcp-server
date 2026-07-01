---
id: hole_classification
field: blind_hole_diameter
tolerance: 0
max_steps: 15
files:
  part: box_with_blind_hole.step
---

# Hole classification

A box contains two holes: an 8mm through-hole and a 12mm blind hole
(8mm deep). Use query_faces to find cylindrical faces, group by axis
to identify which faces belong to each hole. Use measure_step with
ray_test_segment (along_axis_both) to check which holes are blind vs
through. A hole where rays in one direction hit material within <20mm
is blind.

Return the diameter of the blind hole, its depth (extent_along_axis),
and whether the remaining wall under it is thicker than 2mm (the part
is 20mm thick).

Return JSON: {"blind_hole_diameter": number, "blind_hole_depth": number, "wall_passes_2mm": boolean}
