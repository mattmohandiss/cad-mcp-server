"""Bracket v1 and v2: 50×50×10mm plate, v1=3 holes, v2=4 holes"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

for version, holes in [(1, [(0,0),(15,0),(-15,0)]), (2, [(0,0),(15,0),(-15,0),(0,15)])]:
    shape = (
        cq.Workplane("XY")
        .box(50, 50, 10)
        .faces(">Z").workplane()
        .pushPoints(holes)
        .hole(5, 15)
    )
    cq.exporters.export(shape, str(dest / f"bracket_v{version}.step"))

json.dump({"face_count_delta": 1}, open(out / "ground-truth.json", "w"), indent=2)
