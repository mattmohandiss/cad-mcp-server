"""Simple clean box 30x20x10mm, with 0.1mm tolerance check instead of 0.01."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

box = cq.Workplane("XY").box(30, 20, 10)

cq.exporters.export(box, str(out / "clean_block.step"))

json.dump(
    {"is_valid": True, "degenerate_edges": 0, "free_edges": 0, "max_tolerance_below_01": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
