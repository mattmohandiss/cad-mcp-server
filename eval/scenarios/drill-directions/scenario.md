---
id: drill_directions
field: unique_axes
tolerance: 0
max_steps: 8
files:
  box_with_holes: box_with_3_holes.step
---

# Unique drill directions

The box with holes contains three through-holes, all drilled from the
same face. Use group_by axis on cylindrical faces to group faces that
share the same drilling axis. Count how many unique axis groups exist.

All three holes share the same Z-axis direction. Coaxial faces count as
one group.

Return JSON: {"unique_axes": number}
