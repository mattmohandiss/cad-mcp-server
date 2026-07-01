"""50×30×20 mm box with 3 through-holes"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = cq.Workplane("XY").box(50, 30, 20)
for d, x in zip([5.0, 10.0, 15.0], [0, 15, -15]):
    shape = shape.faces(">Z").workplane().pushPoints([(x, 0)]).hole(d, 20)

cq.exporters.export(shape, str(dest / "box_with_3_holes.step"))

# Minimum distance from each hole's cylindrical surface to the nearest
# planar box face (face-to-face distance via measure_step: distance):
#   5mm  hole at (0,0),    r=2.5  → front/back faces at Y=±15  → 15-2.5 = 12.5
#   10mm hole at (15,0),   r=5    → right face at X=25          → 25-20 = 5.0
#   15mm hole at (-15,0),  r=7.5  → left face at X=-25          → 25-22.5 = 2.5
# Overall minimum = 2.5mm from the 15mm hole to the left face.
json.dump(
    {"min_clearance_mm": 2.5},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
