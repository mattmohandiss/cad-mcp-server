"""Inverted cone: wider at top (R15) than base (R10) → negative draft → undercut."""
import cadquery as cq, json, os, math
from pathlib import Path

out = Path(__file__).parent

shape = (
    cq.Workplane("XY")
    .circle(10)
    .workplane(offset=20)
    .circle(15)
    .loft()
)

cq.exporters.export(shape, str(out / "moldability_check_part.step"))

# Inverted cone: base R10 at Z=0, top R15 at Z=20.
# Taper angle = atan(5/20) ≈ 14°. Wall slants outward (wider at top).
# In +Z pull: lateral face has negative draft → undercut.
# Bottom face (normal -Z) also has negative draft relative to +Z pull.
# No vertical faces → faces_below_1deg = 0.
# Sharp corners: top rim + bottom rim = 2.
json.dump(
    {"faces_below_1deg": 0, "undercuts": 2, "sharp_corners": 2, "moldable": False},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
