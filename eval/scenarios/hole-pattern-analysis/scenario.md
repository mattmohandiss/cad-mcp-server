---
id: hole_pattern_analysis
field: unique_sizes
tolerance: 0
max_steps: 15
files:
  plate: hole_pattern_plate.step
---

# Multi-axis hole pattern

This plate has holes in multiple sizes, orientations, and depths.
We're planning the drill operations and need to know:

- How many unique hole sizes are there?
- How many distinct drilling directions?
- How many holes are blind vs through?

Return JSON: {"unique_sizes": number, "unique_directions": number, "blind_count": number, "through_count": number}
