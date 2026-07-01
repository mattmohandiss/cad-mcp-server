---
id: hole_type
field: small
tolerance: 0
max_steps: 8
files:
  box_with_holes: box_with_3_holes.step
---

# Hole size classification

The box with three holes has holes of diameters 5mm, 10mm, and 15mm.
Classify them by size: small (<10mm), medium (10-15mm), large (>15mm).

Use query_faces to find cylindrical faces with their diameters.
Count how many holes fall into each category.

Return JSON: {"small": number, "medium": number, "large": number}
