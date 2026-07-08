---
id: moldability_check
field: moldable
tolerance: 0
max_steps: 12
files:
  part: moldability_check_part.step
---

# Injection molding corner check

This tapered cone has a base radius of 10mm and a top radius of 15mm
(flared outward), making it 20mm tall. The +Z direction is the pull
direction for a two-part injection mold.

Before committing to tooling, check whether there are any faces with less
than 1° draft, any undercuts (negative draft), and any sharp corners
(dihedral angle over 30°). Sharp corners on a molded part may cause
stress concentrations and ejection problems.

The part is only moldable in a simple two-part mold if all three
counts (faces below 1°, undercuts, sharp corners) are zero.

Return JSON: {"faces_below_1deg": number, "undercuts": number, "sharp_corners": number, "moldable": boolean}
