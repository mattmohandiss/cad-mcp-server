"""Two bodies with 2mm gap: cube at origin, cube shifted in +Y"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

body0 = cq.Workplane("XY").box(10, 10, 10).translate((0, -6, 0))
body1 = cq.Workplane("XY").box(10, 10, 10).translate((0, 6, 0))

assembly = body0.union(body1)

cq.exporters.export(assembly, str(dest / "two_body_gap.step"))

# Ground truth:
# body0: cube centered at (0, -6, 0), extends Y from -11 to -1
# body1: cube centered at (0, 6, 0), extends Y from 1 to 11
# Gap between closest faces = 2mm
json.dump(
    {"min_clearance_mm": 2.0, "approach_pairs": 1, "gap_maintained": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
