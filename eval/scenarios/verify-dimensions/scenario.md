---
id: verify_dimensions
field: matches
tolerance: 0
max_steps: 8
files:
  box: verify_box.step
---

# Verify dimensions

The box is supposed to be 60 mm wide, 40 mm tall,
and 25 mm deep. Verify that the model matches these specifications. Report
all three measured dimensions.

Return JSON: {"matches": boolean, "width": number, "height": number, "depth": number}
