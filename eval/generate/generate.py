"""
Generate the LLM eval's test STEP files with known design intent.

Each generator builds a shape with cadquery, exports it as STEP, and
writes a meta.json with the ground-truth answers that the LLM eval
checks against.

Usage (from the repo root, with the dev shell active):
    python -m venv eval/generate/.venv
    eval/generate/.venv/bin/pip install -r eval/generate/requirements.txt
    # On NixOS: the venv's bin/python is replaced with a wrapper that
    # sets LD_LIBRARY_PATH so cadquery-ocp can find its native deps.
    # See eval/README.md for the NixOS-specific setup.
    eval/generate/.venv/bin/python eval/generate/generate.py

The generated files are written to samples/eval-generated/ and are
expected to be committed. Re-running the script is idempotent: same
input => same output, so the meta.json files don't change.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import cadquery as cq


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = REPO_ROOT / "samples" / "eval-generated"


# ---------------------------------------------------------------------------
# Ground truth shape
# ---------------------------------------------------------------------------

@dataclass
class GroundTruth:
    """The expected answers for a single generated STEP file.

    These are the values the LLM eval checks against. Keep them simple
    and concrete; the eval compares the LLM's extracted answer to the
    value (with a tolerance for continuous measurements).
    """
    file: str
    design_intent: str
    expected_answers: dict[str, Any] = field(default_factory=dict)
    notes: str = ""


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def make_simple_box() -> tuple[str, GroundTruth]:
    """A 50x30x20 mm box, no features."""
    result = cq.Workplane("XY").box(50, 30, 20)
    return "box.step", GroundTruth(
        file="box.step",
        design_intent="50x30x20mm rectangular box, no features. 6 planar faces, watertight.",
        expected_answers={
            "face_count": 6,
            "watertight": True,
            "planar_faces": 6,
            "cylindrical_faces": 0,
            "volume_mm3": 50 * 30 * 20,
            "surface_area_mm2": 2 * (50 * 30 + 30 * 20 + 50 * 20),
        },
        notes="Use to test face count, watertight check, bbox, volume, surface area.",
    )


def make_box_with_3_holes() -> tuple[str, GroundTruth]:
    """A 50x30x20 mm box with 3 through-holes of known diameters."""
    diameters = [5.0, 10.0, 15.0]
    x_offsets = [0, 15, -15]

    result = cq.Workplane("XY").box(50, 30, 20)
    for d, x in zip(diameters, x_offsets):
        result = (
            result
            .faces(">Z").workplane()
            .pushPoints([(x, 0)])
            .hole(d, 20)
        )
    return "box_with_3_holes.step", GroundTruth(
        file="box_with_3_holes.step",
        design_intent="Box with 3 through-holes of diameters 5mm, 10mm, 15mm, all on the Z axis.",
        expected_answers={
            "cylindrical_face_groups": 3,
            "smallest_diameter_mm": 5.0,
            "largest_diameter_mm": 15.0,
            "coaxial_groups": 3,
        },
        notes="Use to test cylinder filtering, sort by diameter, group_by axis, count distinct axes.",
    )


def make_box_with_blind_hole() -> tuple[str, GroundTruth]:
    """A 50x30x20 mm box with 1 through-hole and 1 blind hole."""
    result = cq.Workplane("XY").box(50, 30, 20)
    result = result.faces(">Z").workplane().pushPoints([(0, 0)]).hole(8, 25)
    result = result.faces(">Z").workplane().pushPoints([(15, 0)]).hole(12, 8)
    return "box_with_blind_hole.step", GroundTruth(
        file="box_with_blind_hole.step",
        design_intent="Box with 1 through-hole (8mm) and 1 blind hole (12mm, 8mm deep in 20mm box).",
        expected_answers={
            "cylindrical_face_groups": 2,
            "smallest_diameter_mm": 8.0,
            "largest_diameter_mm": 12.0,
            "blind_hole_count": 1,
        },
        notes="Use to test blind-hole detection via ray_test_segment in both directions.",
    )


def make_stepped_cylinder() -> tuple[str, GroundTruth]:
    """A stepped shaft with 2 fillets of known radii.

    Section 1: radius 10mm, length 30mm. Top edge fillet R1.
    Section 2: radius 15mm, length 20mm. Bottom edge fillet R3.
    """
    result = (
        cq.Workplane("XY")
        .circle(10).extrude(30)
        .faces(">Z").edges().fillet(1.0)
        .faces(">Z").workplane()
        .circle(15).extrude(20)
        .faces("<Z").edges().fillet(3.0)
    )
    return "stepped_cylinder.step", GroundTruth(
        file="stepped_cylinder.step",
        design_intent="Stepped shaft: 10mm radius for 30mm, then 15mm radius for 20mm, with R1 and R3 fillets.",
        expected_answers={
            "smallest_fillet_radius_mm": 1.0,
            "circular_edges": 4,
        },
        notes="Use to test smallest-fillet query, circular edge filtering by radius.",
    )


def make_bracket(version: int) -> tuple[str, GroundTruth]:
    """A 50x50x10 mm base plate with N through-holes.

    v1: 3 holes at (0,0), (15,0), (-15,0).
    v2: same + 1 extra hole at (0, 15).

    Used to test diff_step: v1 vs v2 should differ by exactly 1
    cylindrical face group + 2 cylindrical face entries (1 per side
    of the hole).
    """
    holes_v1 = [(0, 0), (15, 0), (-15, 0)]
    holes_v2 = holes_v1 + [(0, 15)]

    holes = holes_v1 if version == 1 else holes_v2

    result = (
        cq.Workplane("XY")
        .box(50, 50, 10)
        .faces(">Z").workplane()
        .pushPoints(holes)
        .hole(5, 15)  # depth 15 > plate thickness 10 => through hole
    )
    return f"bracket_v{version}.step", GroundTruth(
        file=f"bracket_v{version}.step",
        design_intent=(
            f"50x50x10mm base plate with {len(holes)} through-holes "
            f"(5mm diameter, {len(holes_v1)} on v1, {len(holes) - len(holes_v1)} extra on v2)."
        ),
        expected_answers={
            "cylindrical_face_groups": len(holes),
            "holes_on_base": len(holes),
        },
        notes=(
            "Use to test diff_step between v1 and v2. "
            "Expected diff: +1 cylindrical face group, +2 cylindrical face entries, "
            "+N edge entries (the extra hole contributes inner + outer edges)."
        ),
    )


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

GENERATORS = [
    make_simple_box,
    make_box_with_3_holes,
    make_box_with_blind_hole,
    make_stepped_cylinder,
    lambda: make_bracket(1),
    lambda: make_bracket(2),
]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for gen in GENERATORS:
        filename, truth = gen()
        out_path = OUTPUT_DIR / filename
        meta_path = OUTPUT_DIR / f"{Path(filename).stem}.meta.json"

        # Build the shape.
        if "bracket" in filename:
            version = int(filename.split("v")[1].split(".")[0])
            holes = [(0, 0), (15, 0), (-15, 0)] + ([(0, 15)] if version == 2 else [])
            shape = (
                cq.Workplane("XY")
                .box(50, 50, 10)
                .faces(">Z").workplane()
                .pushPoints(holes)
                .hole(5, 15)
            )
        elif "simple_box" in filename or filename == "box.step":
            shape = cq.Workplane("XY").box(50, 30, 20)
        elif "3_holes" in filename:
            shape = cq.Workplane("XY").box(50, 30, 20)
            for d, x in zip([5.0, 10.0, 15.0], [0, 15, -15]):
                shape = (
                    shape
                    .faces(">Z").workplane()
                    .pushPoints([(x, 0)])
                    .hole(d, 20)
                )
        elif "blind_hole" in filename:
            shape = cq.Workplane("XY").box(50, 30, 20)
            shape = shape.faces(">Z").workplane().pushPoints([(0, 0)]).hole(8, 25)
            shape = shape.faces(">Z").workplane().pushPoints([(15, 0)]).hole(12, 8)
        elif "stepped_cylinder" in filename:
            shape = (
                cq.Workplane("XY")
                .circle(10).extrude(30)
                .faces(">Z").edges().fillet(1.0)
                .faces(">Z").workplane()
                .circle(15).extrude(20)
                .faces("<Z").edges().fillet(3.0)
            )
        else:
            raise RuntimeError(f"unknown generator for {filename}")

        cq.exporters.export(shape, str(out_path))
        meta_path.write_text(json.dumps(asdict(truth), indent=2) + "\n")
        print(f"wrote {out_path.relative_to(REPO_ROOT)} and {meta_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
