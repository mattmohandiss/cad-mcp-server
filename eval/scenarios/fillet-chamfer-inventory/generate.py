"""Box 40x30x20, filleted at R2 on 4 vertical edges, chamfered 1mm on 4 top edges, leaving 4 sharp bottom edges"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

box = cq.Workplane("XY").box(40, 30, 20)
box = box.edges("|Z").fillet(2)
box = box.edges(">Z").chamfer(1)

cq.exporters.export(box, str(dest / "fillet_chamfer_bracket.step"))

# 4 vertical rounded corner features at R2. These are feature-level treatments;
# in BRep topology each round is represented by a cylindrical face bounded by
# multiple edges, not by one persistent design edge.
# 4 top chamfered edge features are planar bevels.
# 4 external bottom edges remain sharp (dihedral angle over 30°).
json.dump(
    {
        "edge_treatment_audit": {
            "rounded_vertical_corner_features": 4,
            "top_chamfer_features": 4,
            "sharp_bottom_external_edges": 4,
            "rounded_vertical_corner_radius_mm": 2.0,
        }
    },
    open(out / "ground-truth.json", "w"),
    indent=2,
)
