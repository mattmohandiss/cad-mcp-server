"""Box with 1 through-hole and 1 deep blind hole (12mm depth)."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
shape = shape.faces(">Z").workplane().pushPoints([(0, 0)]).hole(6, 20)
shape = shape.faces(">Z").workplane().pushPoints([(15, 0)]).hole(8, 12)

cq.exporters.export(shape, str(out / "classify_hole_box.step"))

# Blind hole: d=8mm, depth=12mm → remaining wall = 20-12 = 8mm > 2mm
json.dump(
    {"blind_hole_diameter": 8.0, "blind_hole_depth": 12.0, "wall_passes_2mm": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
