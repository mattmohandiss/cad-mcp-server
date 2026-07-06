"""Plate 80x60x10mm with 8 holes: 4 sizes, 3 directions, 2 blind"""
import cadquery as cq, json, os
from pathlib import Path

out = Path(__file__).parent
dest = Path(os.environ["CAD_MCP_EVAL_OUTPUT_DIR"])
dest.mkdir(parents=True, exist_ok=True)

plate = cq.Workplane("XY").box(80, 60, 10)

# +Z through-holes: 4mm, 6mm, 8mm diameters
plate = plate.faces(">Z").workplane().pushPoints([(20, 0)]).hole(4, 15)
plate = plate.faces(">Z").workplane().pushPoints([(-20, 0)]).hole(6, 15)
plate = plate.faces(">Z").workplane().pushPoints([(0, 15)]).hole(8, 15)

# +Z blind holes: 10mm diameter, 6mm deep
plate = plate.faces(">Z").workplane().pushPoints([(0, -15), (25, 10)]).hole(10, 6)

# +X through-hole: 4mm
plate = plate.faces(">X").workplane().pushPoints([(0, 0)]).hole(4, 15)

# -X through-hole: 6mm
plate = plate.faces("<X").workplane().pushPoints([(0, 0)]).hole(6, 15)

cq.exporters.export(plate, str(dest / "hole_pattern_plate.step"))

# Ground truth:
# Unique sizes (by radius grouping): 4mm, 6mm, 8mm, 10mm = 4
# Unique directions: +Z, +X, -X = 3
# Blind holes: 2 (both 10mm)
# Through holes: 4 (+Z 4mm, 6mm, 8mm; +X 4mm; -X 6mm) = 5
# But wait — +X and -X holes are on side faces, need to count carefully.
# Actually: +Z has 3 through (4,6,8mm) + 2 blind (10mm × 2)
# +X has 1 through (4mm)
# -X has 1 through (6mm)
# Total: 5 through, 2 blind
json.dump(
    {"unique_sizes": 4, "unique_directions": 3, "blind_count": 2, "through_count": 5},
    open(out / "ground-truth.json", "w"),
    indent=2,
)
