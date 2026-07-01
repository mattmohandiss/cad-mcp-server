"""Box with 1 through-hole (8mm) and 1 blind hole (12mm, 8mm deep)"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = cq.Workplane("XY").box(50, 30, 20)
shape = shape.faces(">Z").workplane().pushPoints([(0, 0)]).hole(8, 25)
shape = shape.faces(">Z").workplane().pushPoints([(15, 0)]).hole(12, 8)

cq.exporters.export(shape, str(dest / "box_with_blind_hole.step"))

json.dump({"through_holes": 1, "blind_holes": 1}, open(out / "ground-truth.json", "w"), indent=2)
