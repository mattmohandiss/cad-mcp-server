"""50×30×20 mm box with 3 through-holes (5, 10, 15 mm), all along Z"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = cq.Workplane("XY").box(50, 30, 20)
for d, x in zip([5.0, 10.0, 15.0], [0, 15, -15]):
    shape = shape.faces(">Z").workplane().pushPoints([(x, 0)]).hole(d, 20)

cq.exporters.export(shape, str(dest / "box_with_3_holes.step"))

json.dump({"unique_axes": 1}, open(out / "ground-truth.json", "w"), indent=2)
