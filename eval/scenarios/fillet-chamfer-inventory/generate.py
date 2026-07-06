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

# 4 vertical filleted edges at R2 → these edges are straight (not circular)
# The fillets create partial cylindrical faces around the original edges
# 4 bottom edges are sharp (no fillet, no chamfer) → 90° dihedral
# 4 top chamfered edges are planar bevels (not circular)
json.dump(
    {"g1_fillet_edges": 4, "sharp_corners": 4, "smallest_fillet_radius_mm": 2.0},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
