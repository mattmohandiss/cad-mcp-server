---
id: fillet_chamfer_inventory
field: edge_treatment_audit
tolerance: 0
max_steps: 12
files:
  bracket: fillet_chamfer_bracket.step
---

# Edge treatment audit

This bracket has a mix of filleted edges, chamfered edges, and sharp
corners. We need to audit the edge quality before machining.

Identify the edge treatments at the feature level:

- how many rounded vertical corner features are present
- how many chamfered top-edge features are present
- how many external bottom edges remain sharp with dihedral angle over 30°
- the radius of the rounded vertical corner features

Return JSON: {"edge_treatment_audit": {"rounded_vertical_corner_features": number, "top_chamfer_features": number, "sharp_bottom_external_edges": number, "rounded_vertical_corner_radius_mm": number}}
