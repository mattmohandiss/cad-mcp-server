"""Stepped shaft: R10×30mm + R15×20mm, with R1 and R3 fillets"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = (
    cq.Workplane("XY")
    .circle(10).extrude(30)
    .faces(">Z").edges().fillet(1.0)
    .faces(">Z").workplane()
    .circle(15).extrude(20)
    .faces("<Z").edges().fillet(3.0)
)

cq.exporters.export(shape, str(dest / "stepped_cylinder.step"))

json.dump({"radius_mm": 1.0}, open(out / "ground-truth.json", "w"), indent=2)
