"""50x30x20 mm box with 3 through-holes, one close to edge (2mm clearance)."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
for d, x in zip([6.0, 10.0, 12.0], [20, 0, -10]):
    shape = shape.faces(">Z").workplane().pushPoints([(x, 0)]).hole(d, 20)

cq.exporters.export(shape, str(out / "clearance_box.step"))

# Min clearance: hole at X=20, d=6 (r=3) → 25 - 20 - 3 = 2mm to right face
json.dump({"min_clearance_mm": 2.0}, open(out / "ground-truth.json", "w"), indent=2)
