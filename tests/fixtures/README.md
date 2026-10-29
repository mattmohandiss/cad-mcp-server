# Test fixtures

Each file here exists to exercise one behaviour. Everything except the NIST file was
generated locally and is covered by `occt/sidecar/tests/`.

| File                             | What it is for                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curved-sector.step`             | One solid, five faces, no PMI. The default shape for viewer, measurement, and topology tests.                                                                                                             |
| `open-shell.step`                | No solid material. Exercises the path where volume is unavailable and faces are still addressable.                                                                                                        |
| `repeated-instances.step`        | An assembly: one 10 mm cube instanced twice, the second translated +20 along x. Exercises occurrence-scoped IDs, and makes a cross-component measurement have a known answer (`body:0` ↔ `body:1` is 10). |
| `repeated-instances-inch.step`   | The same assembly written in inches. Exercises unit handling.                                                                                                                                             |
| `repeated-instances-metre.step`  | The same assembly written in metres. Exercises unit handling at the other extreme.                                                                                                                        |
| `nist_ctc_01_asme1_ap242-e1.stp` | Real semantic PMI. The only file here that declares dimensions, geometric tolerances, and datums. **Fetched, not committed** — see below.                                                                 |

## `nist_ctc_01_asme1_ap242-e1.stp`

**It is not in the repository.** `*.stp` is ignored, so the PMI reader and join have no
committed fixture and their integration tests skip when it is absent — the tests are written
to skip rather than to pass without it. Fetch the file, check the SHA-256 below, and place it
here; the AP203 twins used by the graphical-only test are in the same download
(`AP203 with PMI/nist_ctc_01_asme1_ap203.stp` and `AP203 geometry only/nist_ctc_01_asme1_rd.stp`).

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
for the intended values. It is not committed here.
