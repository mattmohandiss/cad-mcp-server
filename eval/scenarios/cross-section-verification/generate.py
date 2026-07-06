"""C-channel beam 100mm long, web 3mm thick, flanges 5mm thick, 40mm tall"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

# C-channel extrusion: outer 40x20, inner wall 3mm, flange 5mm
profile = (
    cq.Workplane("XZ")
    .hLine(20).vLine(40).hLine(-17).vLine(-34).hLine(14).vLine(-6).close()
)
beam = profile.extrude(100)

cq.exporters.export(beam, str(dest / "c_channel_beam.step"))

# Ground truth: C-channel cross-section has 8 edges (outer C + inner C)
# Web thickness = 3mm
# The section at Y=50 cuts through the web and both flanges
json.dump(
    {"section_edges": 8, "web_thickness_mm": 3.0},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
