---
id: drill_directions
field: unique_axes
tolerance: 0
max_steps: 8
files:
  box_with_holes: box_with_3_holes.step
---

# Drilling direction count

This box has three through-holes, all drilled from the same face.
We're setting up a CNC drill operation. How many unique drilling
directions does this part need? Coaxial holes count as one direction.

Return JSON: {"unique_axes": number}
