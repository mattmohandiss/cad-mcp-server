---
id: verify_dimensions
field: matches
tolerance: 0
max_steps: 8
files:
  box: box.step
---

# Verify dimensions

The box is supposed to be 50 mm wide, 30 mm tall,
and 20 mm deep. Verify that the model matches these specifications. Report
all three measured dimensions.

Return JSON: {"matches": boolean, "width": number, "height": number, "depth": number}
