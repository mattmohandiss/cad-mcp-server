---
id: clearance_hole_to_edge
field: min_clearance_mm
tolerance: 0.1
max_steps: 10
files:
  box_with_holes: box_with_3_holes.step
---

# Hole-to-edge clearance

This box has three through-holes. What is the minimum distance from
any hole surface to the nearest outer wall of the box? This is a
clearance check for manufacturability.

Return JSON: {"min_clearance_mm": number}
