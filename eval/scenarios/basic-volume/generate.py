"""50×30×20 mm box."""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent

shape = cq.Workplane("XY").box(50, 30, 20)
cq.exporters.export(shape, str(out / "box.step"))

json.dump({"volume_mm3": 50 * 30 * 20}, open(out / "ground-truth.json", "w"), indent=2)
