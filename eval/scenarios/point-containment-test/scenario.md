---
id: point_containment_test
field: center_inside
tolerance: 0
max_steps: 8
files:
  block: containment_block.step
---

# Point-in-solid test

This block has an 8mm through-hole. We need to check three locations
for solid material:

- A point 6mm from the hole center, at the block mid-height
- The exact center of the through-hole at mid-height
- A point well outside the block

Which of these points are inside solid material?

Return JSON: {"center_inside": boolean, "hole_center_inside": boolean, "outside_inside": boolean}
