---
id: clearance_hole_to_edge
field: min_clearance_mm
tolerance: 0.1
max_steps: 10
files:
  box_with_holes: box_with_3_holes.step
---

# Clearance check: holes to box faces

The box with three holes needs a clearance check. Find the minimum
distance from each cylindrical hole face to the nearest planar box
face (the outer walls of the box).

Use query_faces to find all cylindrical faces, then query_faces again
to find the box's planar faces. Use measure_step with op distance to
compute the shortest distance from each hole surface to the nearest
outer wall.

Return JSON: {"min_clearance_mm": number}
