# Test fixtures

**Nothing here is committed.** The directory is a build product: `just fixtures` builds the
generator that lives in this repository and runs it here, and `just test-integration`
regenerates it before it runs.

Two reasons every STEP file here is generated instead of stored:

- **A STEP file cannot be reviewed.** The shape a test asserts about is a fact about a binary;
  the generator states it as parameters with the property each test depends on written beside
  them. Adding a fixture with a known clearance is a five-line change rather than a CAD session.
- **A stored fixture drifts, and an orphan is invisible.** Two of these files once had no
  generator at all — nobody could tell how they were made, and nothing could remake them.

Everything except the NIST files comes from
[`occt/sidecar/tests/generate_fixtures.cpp`](../occt/sidecar/tests/generate_fixtures.cpp).

| File                             | What it is for                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curved-sector.step`             | One solid, five faces, one of them curved: a 90° sector of a 20 mm diameter, 6 mm thick. The default shape for viewer, measurement, and topology tests, and the bounding box its test asserts (10 wide, 20·sin 45° tall, arc extreme interior) comes from those parameters. |
| `open-shell.step`                | No solid material: a 40 × 30 × 20 box with its top face removed, so volume is unavailable while all five faces stay addressable.                                                                                                                                            |
| `repeated-instances.step`        | An assembly: one 10 mm cube instanced twice, the second translated +20 along x, components named `RepeatedPart`. Exercises occurrence-scoped IDs, and makes a cross-component measurement have a known answer (`body:0` ↔ `body:1` is 10).                                  |
| `repeated-instances-inch.step`   | The same assembly with the declared length unit rewritten to inches, coordinates untouched. Exercises unit handling.                                                                                                                                                        |
| `repeated-instances-metre.step`  | The same, in metres. Unit handling at the other extreme.                                                                                                                                                                                                                    |
| `nist_ctc_01_asme1_ap242-e1.stp` | Real semantic PMI. The only file here that declares dimensions, geometric tolerances, and datums. **Fetched by hand** — see below.                                                                                                                                          |

The unit variants are text edits of the millimetre file, not conversions: the same numbers under
another unit is the property those two fixtures exist to test. Writing them with OCCT's
`write.step.unit` would scale the coordinates instead.

## The NIST files: fetched, not generated

These are deliberately **not** generated. They carry a real exporter's semantic PMI, its
graphical-only AP203 twin, and a tessellated AP242 export — and a file this repository authored
would test the reader against our own writer, which proves nothing.

The PMI reader and join tests **skip** when the files are absent; they are written to skip rather
than to pass without them. To run them, fetch and place:

- `nist_ctc_01_asme1_ap242-e1.stp` — semantic PMI (the file below).
- `AP203 with PMI/nist_ctc_01_asme1_ap203.stp` → `nist_ctc_01_asme1_ap203-graphical.stp` — the
  same part with callouts that exist only as graphics.
- `AP203 geometry only/nist_ctc_01_asme1_rd.stp` → `nist_ctc_01_asme1_ap203-geometry.stp` — the
  same part with nothing declared at all.

### `nist_ctc_01_asme1_ap242-e1.stp`

Provenance: the NIST MBE PMI Validation and Conformance Testing project, "NIST PMI STEP
Files" (https://www.nist.gov/document/nist-pmi-step-files), file
`nist_ctc_01_asme1_ap242-e1.stp`, 396 445 bytes, SHA-256
`85a5752da05f53c456ca3a9e038c90358e1d5a3141d1f0d6e5f0970f2356e821`. NIST publishes
these for interoperability testing without restriction; they are US Government works.

It is AP242 edition 1 with _semantic_ PMI, which is what makes it useful: 11 dimensional
callouts (9 size, 2 location), 6 geometric tolerances (position, profile of a surface,
perpendicularity, flatness), 3 datums, 117 faces. Real CAD output rarely carries PMI at
all, so this file is the only way to exercise the reader and the PMI join at all.

Four of its twelve dimensions arrive with `nominal: 0`, and two of those sit on the same
faces as a dimension that does carry a value — on purpose, they are `DIMENSIONAL_LOCATION`
callouts whose faces match the two `position` tolerances, and they define those frames
instead of stating a requirement. Two more are duplicate objects for a face pair that is
already covered. Any test of the PMI join should keep hitting all of that: it is the
reason `value_resolved` and the basic-dimension rule exist.

The matching `nist_ctc_01_asme1_rd.pdf` drawing in the same NIST download is the oracle
for the intended values. It is not committed here either.
