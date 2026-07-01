"""50×30×20 mm box with 3 through-holes (5, 10, 15 mm)"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = cq.Workplane("XY").box(50, 30, 20)
for d, x in zip([5.0, 10.0, 15.0], [0, 15, -15]):
    shape = shape.faces(">Z").workplane().pushPoints([(x, 0)]).hole(d, 20)

cq.exporters.export(shape, str(dest / "box_with_3_holes.step"))

# Ground truth computed from geometry:
# Box: 50×30×20, centered at origin
# Hole at X=0, r=2.5 → min wall = 12.5 (front/back faces at Y=±15)
# Hole at X=15, r=5 → min wall = 5.0 (right face at X=25)
# Hole at X=-15, r=7.5 → min wall = 2.5 (left face at X=-25)
# Thinnest hole by diameter = 15mm, min wall = 2.5mm, passes 2mm spec
json.dump(
    {
        "thinnest_hole_diameter": 15.0,
        "min_wall_mm": 2.5,
        "passes_2mm_spec": True,
    },
    open(out / "ground-truth.json", "w"),
    indent=2,
)
