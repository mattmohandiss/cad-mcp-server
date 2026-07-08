"""50x30x20 mm box with 3 through-holes (4, 8, 12 mm)."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
for d, x in zip([4.0, 8.0, 12.0], [0, 15, -15]):
    shape = shape.faces(">Z").workplane().pushPoints([(x, 0)]).hole(d, 20)

cq.exporters.export(shape, str(out / "diameter_block.step"))

json.dump({"diameters": [4.0, 8.0, 12.0]}, open(out / "ground-truth.json", "w"), indent=2)
