# Capabilities

This page explains what the current `occt-wasm` MCP can answer from a mechanical-engineering perspective.

## Reliable Today

These questions are well aligned with the current backend:

| Question | Current answer quality |
| --- | --- |
| Does this STEP file import? | Good. Import errors are reported structurally. |
| What is the bounding box? | Good. |
| What are the part dimensions? | Good, based on bounding box. |
| What is the volume? | Good when the imported shape is valid and unit assumptions are understood. |
| What is the surface area? | Good when the imported shape is valid and unit assumptions are understood. |
| How many bodies/solids are present? | Good for straightforward STEP files. |
| How many faces and edges are present? | Good. |
| What surface and curve types are present? | Good for supported OCCT classifications. |
| Are there cylindrical faces or circular edges? | Good. |
| Are faces adjacent? | Useful, based on OCCT topology calls. |
| Is the shape basically valid? | Basic only, through `isValid`. |
| What changed by gross metrics between two files? | Useful for dimensions, area, volume, counts, and metadata deltas. |

## Candidate Or Heuristic Today

These answers can be useful but should be reported as candidates with evidence and limitations:

| Question | Current limitation |
| --- | --- |
| Does this part have holes? | Hole-like candidates are inferred from cylindrical faces, circular edges, and adjacency patterns. |
| Are holes through or blind? | Sometimes inferred from topology patterns; not equivalent to native feature intent. |
| Does this part have fillets? | Fillet-like candidates are inferred from smooth adjacency and curved geometry. |
| Does this part have pockets? | Pocket-like candidates are inferred from planar faces and concave adjacency. |
| Which features matter for machining? | The backend can suggest candidates, not complete manufacturability signoff. |
| Are there mounting interfaces? | Can be approximated later from planar faces and hole patterns; not robust today. |
| Did the design revision change? | Metric deltas are available; stable feature identity is not. |
| Does the file contain PMI? | Lightweight keyword/entity hints only. |
| Is the assembly structure meaningful? | Limited unless XCAF support is expanded and tested. |

## Unsupported Or Not Trustworthy Yet

Do not claim these as production facts with the current backend:

- Full AP242 semantic PMI/GD&T extraction.
- Native CAD feature-tree recovery.
- Stable face/edge IDs across separate STEP imports.
- Cross-revision feature matching with high confidence.
- True thread detection from callouts or semantic PMI.
- Complete hole table with thread/counterbore/countersink classification.
- Accurate wall-thickness maps for arbitrary parts.
- Complete 3-axis/5-axis manufacturability analysis.
- Assembly mate/constraint interpretation.
- Certified inspection or compliance results.

## Useful `occt-wasm` Features To Exploit Next

The backend exposes more than the MCP currently uses. High-value additions include:

- XCAF STEP import for names, colors, and assembly hierarchy.
- Healing helpers for import-health diagnostics, reported separately from original geometry.
- `unifySameDomain` for simplifying noisy imported geometry before analysis.
- point projection and face classification for measurements and picking workflows.
- UV bounds and surface curvature for better fillet/radius reasoning.
- glTF/tessellation output for browser viewer artifacts.
- section/intersection helpers for slices and clearance-style checks.

Lower-value for this MCP:

- CAD creation APIs, except for fixtures and tests.
- Editing/modeling workflows exposed directly to the LLM.
- Raw kernel command execution.

## Answering Style

For engineer-facing answers, preserve the source of truth:

- Say “measured” for direct geometry facts.
- Say “candidate” for inferred features.
- Include confidence and evidence source IDs.
- State unit assumptions.
- State when STEP does not carry the needed design intent.
- Recommend checking drawings/native CAD/PMI for authoritative manufacturing details.

Example:

```text
The file contains 6 cylindrical-face hole candidates. This is derived from B-rep topology, not native CAD feature history. No thread callouts or semantic PMI were parsed, so tapped-hole status cannot be confirmed.
```
