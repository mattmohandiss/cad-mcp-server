---
id: aggregate_statistics
field: cylinder_count
tolerance: 0
max_steps: 10
files:
  bracket: stats_bracket.step
---

# Hole statistics

This bracket has several cylindrical holes. We need statistics for
tooling inventory:

- How many cylindrical faces (hole walls) are there?
- What is the average hole diameter?
- What is the standard deviation of hole diameters?

Return JSON: {"cylinder_count": number, "avg_diameter_mm": number, "stddev_diameter_mm": number}
