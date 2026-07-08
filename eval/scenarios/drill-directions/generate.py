"""Box with holes in two directions (+Z and +X)."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
shape = shape.faces(">Z").workplane().pushPoints([(-8, 0), (8, 0)]).hole(6, 20)
shape = shape.faces(">X").workplane().pushPoints([(0, 0)]).hole(8, 30)

cq.exporters.export(shape, str(out / "multidrill_block.step"))

# 2 unique drilling directions: +Z (2 holes) and +X (1 hole)
json.dump({"unique_axes": 2}, open(out / "ground-truth.json", "w"), indent=2)
