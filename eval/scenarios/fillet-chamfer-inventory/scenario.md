---
id: fillet_chamfer_inventory
field: g1_fillet_edges
tolerance: 0
max_steps: 12
files:
  bracket: fillet_chamfer_bracket.step
---

# Edge quality audit

This bracket has a mix of filleted edges, chamfered edges, and sharp
corners. We need to audit the edge quality before machining.

How many G1-continuous fillet edges are there? How many sharp corners
(dihedral angle over 30°)? What is the smallest fillet radius?

Return JSON: {"g1_fillet_edges": number, "sharp_corners": number, "smallest_fillet_radius_mm": number}
