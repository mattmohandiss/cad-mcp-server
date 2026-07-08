"""50x30x20 mm box with 3 through-holes — one very close to edge (wall fails 2mm spec)."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
# Hole at X=22, d=5mm → 25 - 22 - 2.5 = 0.5mm wall (fails)
shape = shape.faces(">Z").workplane().pushPoints([(22, 0)]).hole(5, 20)
# Hole at X=0, d=8mm → 15mm clearance
shape = shape.faces(">Z").workplane().pushPoints([(0, 0)]).hole(8, 20)
# Hole at X=-12, d=10mm → 8mm clearance
shape = shape.faces(">Z").workplane().pushPoints([(-12, 0)]).hole(10, 20)

cq.exporters.export(shape, str(out / "thinwall_block.step"))

json.dump(
    {"thinnest_hole_diameter": 5.0, "min_wall_mm": 0.5, "passes_2mm_spec": False},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
