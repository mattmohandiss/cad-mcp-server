---
id: surface_curvature_analysis
field: smallest_edge_radius_mm
tolerance: 0.5
max_steps: 10
files:
  sheet: sheet_metal_bracket.step
---

# Minimum bend radius

This sheet metal bracket has two bends. What is the tightest bend
radius and the minimum curvature radius on the bent surfaces?

Can a 2mm diameter tool access all surfaces? (The tool needs a
minimum curvature radius > 1mm.)

Return JSON: {"smallest_edge_radius_mm": number, "min_curvature_radius_mm": number, "tool_2mm_accessible": boolean}
