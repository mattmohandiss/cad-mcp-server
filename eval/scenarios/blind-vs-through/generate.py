"""Box with 2 through-holes and 1 blind hole."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
shape = shape.faces(">Z").workplane().pushPoints([(10, 0)]).hole(6, 20)
shape = shape.faces(">Z").workplane().pushPoints([(-10, 0)]).hole(8, 20)
shape = shape.faces(">Z").workplane().pushPoints([(0, 0)]).hole(10, 8)

cq.exporters.export(shape, str(out / "blind_through_box.step"))

json.dump({"through_holes": 2, "blind_holes": 1}, open(out / "ground-truth.json", "w"), indent=2)
