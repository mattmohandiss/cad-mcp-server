---
id: clearance_verification
field: min_clearance_mm
tolerance: 0.1
max_steps: 8
files:
  assembly: two_body_gap.step
---

# Two-body clearance

This STEP file contains two bodies with a known gap between them.
We need to verify the clearance for assembly fit.

What is the minimum clearance between the two bodies?
Is the gap maintained (>= 0.5mm)?

Return JSON: {"min_clearance_mm": number, "gap_maintained": boolean}
