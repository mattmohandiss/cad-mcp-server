---
id: draft_check
field: min_draft_deg
tolerance: 0.5
max_steps: 10
files:
  pin: tapered_pin.step
---

# Draft angle check

A 20mm tall tapered pin has a base radius of 10mm and top radius of 8mm.
Use measure_step with op draft_angle and direction [0,0,1] (+Z pull) on
all lateral faces (query_faces for cylinder or cone surfaces). Check if
the minimum draft angle exceeds 1° — a requirement for injection molding.

The pin tapers inward from bottom to top, so draft angles should be
positive (>0°). Faces with 0° draft are parting surfaces (top/bottom).

Return JSON: {"min_draft_deg": number, "moldable": boolean}
