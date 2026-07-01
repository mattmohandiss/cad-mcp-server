"""Tapered cylinder: base radius 10mm, top radius 8mm, height 20mm"""
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

cq.exporters.export(shape, str(dest / "tapered_pin.step"))

# Taper angle = atan((10-8)/20) = atan(0.1) ≈ 5.71°
# Draft angle relative to +Z = 5.71° → positive → moldable from bottom
# All lateral faces have same draft angle since it's a linear loft.
# Top face (Z+) is horizontal → 0° draft → parting surface
# Bottom face (Z-) is horizontal → 0° draft → parting surface
json.dump(
    {"min_draft_deg": 5.7, "moldable": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
