"""Box 40x30x20 with 3 holes (R3, R3, R5). NO fillets — clean geometry only."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

box = cq.Workplane("XY").box(40, 30, 10)
box = box.faces(">Z").workplane().pushPoints([(12, 0), (-12, 0)]).hole(6, 15)
box = box.faces(">Z").workplane().pushPoints([(0, 5)]).hole(10, 15)

cq.exporters.export(box, str(dest / "stats_bracket.step"))

# 3 cylindrical faces: radii 3, 3, 5 → diameters 6, 6, 10
# avg = (6+6+10)/3 = 7.33, stddev(sample) = sqrt(((6-7.33)^2+(6-7.33)^2+(10-7.33)^2)/2) ≈ 2.31
# No fillets, so no circular edges besides the hole rims (which are edges, not faces)
json.dump(
    {"cylinder_count": 3, "avg_diameter_mm": 7.3, "stddev_diameter_mm": 2.3},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
