---
id: wall_thickness_analysis
field: uniform
tolerance: 0.5
max_steps: 10
files:
  shell: thin_walled_box.step
---

# Wall thickness uniformity

This is a shelled box. Sample the wall thickness across all 6 outer
faces at 2mm spacing. What are the minimum and maximum wall
thicknesses? Are the walls uniform — all measurements within
1mm of each other?

Return JSON: {"min_wall_mm": number, "max_wall_mm": number, "uniform": boolean}
