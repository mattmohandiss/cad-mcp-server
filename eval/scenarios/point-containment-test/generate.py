"""Block 20x20x20mm with 8mm through-hole along Z"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

block = cq.Workplane("XY").box(20, 20, 20)
block = block.faces(">Z").workplane().hole(8, 25)

cq.exporters.export(block, str(dest / "containment_block.step"))

# Point A [6, 0, 0]: 6mm from hole center, 2mm from hole edge (r=4), inside solid
# Point B [0, 0, 0]: hole center, inside void
# Point C [0, 25, 0]: outside block entirely (block extends ±10 in Y)
json.dump(
    {"center_inside": True, "hole_center_inside": False, "outside_inside": False},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
