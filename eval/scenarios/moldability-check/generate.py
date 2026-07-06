"""Tapered pin: base radius 10mm, top radius 8mm, height 20mm"""
import cadquery as cq, json, os, math
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = (
    cq.Workplane("XY")
    .circle(10)
    .workplane(offset=20)
    .circle(8)
    .loft()
)

cq.exporters.export(shape, str(dest / "moldability_pin.step"))

# Taper angle = atan((10-8)/20) = atan(0.1) = 5.71°
# Lateral cone face: draft = 5.71° → above 1°, not undercut
# Top and bottom faces: horizontal → draft = 90° → above 1°, not undercut
# Top and bottom rims: dihedral between cone and flat ≈ 84-96° → >30° → sharp
# No undercuts, no faces below 1°
json.dump(
    {"faces_below_1deg": 0, "undercuts": 0, "sharp_corners": 2, "moldable": False},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
