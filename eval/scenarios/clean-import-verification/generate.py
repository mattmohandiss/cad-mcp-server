"""Simple clean box 30x20x10mm"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

box = cq.Workplane("XY").box(30, 20, 10)

cq.exporters.export(box, str(dest / "clean_block.step"))

# Ground truth: a simple box from CadQuery should always be clean
json.dump(
    {"is_valid": True, "degenerate_edges": 0, "free_edges": 0, "max_tolerance_below_001": True},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
