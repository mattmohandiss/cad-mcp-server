---
id: blind_vs_through
field: through_holes
tolerance: 0
max_steps: 12
files:
  box_with_blind_hole: box_with_blind_hole.step
---

# Blind vs through holes

This box contains two holes. One is blind (doesn't go all the way through)
and one goes through the full depth. Determine which is which.

Return JSON: {"through_holes": number, "blind_holes": number}
