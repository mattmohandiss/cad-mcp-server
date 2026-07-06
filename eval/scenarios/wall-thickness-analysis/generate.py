"""Shelled box 50x40x30mm with 2mm uniform wall thickness"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

box = cq.Workplane("XY").box(50, 40, 30)
shell = box.faces(">Z").shell(2)

cq.exporters.export(shell, str(dest / "thin_walled_box.step"))

# Uniform 2mm shell on all walls
json.dump(
    {"min_wall_mm": 2.0, "max_wall_mm": 2.0, "uniform": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
