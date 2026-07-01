---
id: blind_vs_through
field: through_holes
tolerance: 0
max_steps: 12
files:
  box_with_blind_hole: box_with_blind_hole.step
---

# Blind vs through holes

The box with blind hole contains two holes.
One is blind (doesn't go all the way through). Which one is it?
Use ray tests from both ends to classify each hole as blind or through.

Return JSON: {"through_holes": number, "blind_holes": number}
