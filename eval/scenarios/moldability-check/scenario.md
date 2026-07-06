---
id: moldability_check
field: moldable
tolerance: 0
max_steps: 12
files:
  pin: moldability_pin.step
---

# Injection molding corner check

This tapered pin was designed for injection molding with a +Z pull
direction. Before committing to tooling, check whether there are any
faces with less than 1° draft, any undercuts (negative draft), and
any sharp corners (dihedral angle over 30°). Sharp corners on a
molded part may cause stress concentrations and ejection problems.

The part is only moldable in a simple two-part mold if all three
counts (faces below 1°, undercuts, sharp corners) are zero.

Return JSON: {"faces_below_1deg": number, "undercuts": number, "sharp_corners": number, "moldable": boolean}
