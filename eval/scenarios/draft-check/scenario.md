---
id: draft_check
field: min_draft_deg
tolerance: 0.5
max_steps: 10
files:
  pin: tapered_pin.step
---

# Injection molding draft check

This 20mm tall tapered pin has a base radius of 10mm and a top radius
of 8mm, tapering inward from bottom to top. It is intended for injection
molding with a +Z pull direction.

What is the minimum draft angle on the lateral faces? Does the part meet
the 1° minimum draft requirement for injection molding? The top and
bottom faces are parting surfaces and don't need draft.

Return JSON: {"min_draft_deg": number, "moldable": boolean}
