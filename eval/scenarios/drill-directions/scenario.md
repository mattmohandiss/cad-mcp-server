---
id: drill_directions
field: unique_axes
tolerance: 0
max_steps: 8
files:
  block: multidrill_block.step
---

# Drilling direction count

This block has holes from two different faces. We're setting up a CNC
drill operation. How many unique drilling directions does this part
need? Coaxial holes count as one direction.

Return JSON: {"unique_axes": number}
