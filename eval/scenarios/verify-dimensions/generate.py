"""60x40x25 mm box, unique per scenario."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(60, 40, 25)
cq.exporters.export(shape, str(out / "verify_box.step"))

json.dump({"matches": True, "width": 60, "height": 40, "depth": 25}, open(out / "ground-truth.json", "w"), indent=2)
