"""50×30×20 mm box."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

shape = cq.Workplane("XY").box(50, 30, 20)
cq.exporters.export(shape, str(dest / "box.step"))

json.dump({"plane": 6, "cylinder": 0}, open(out / "ground-truth.json", "w"), indent=2)
