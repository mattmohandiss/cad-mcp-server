# How CAD MCP works

CAD MCP gives an MCP host access to measured facts about local STEP geometry. It
uses Open CASCADE for the geometry, returns structured results the host and model
can interpret, and stays out of the way of the engineering judgement on top.

## Typical workflow

1. `inspect` a local STEP file to get its content revision, overall dimensions,
   volume and surface area, model structure, and B-rep health.
2. `find_entities` to locate the faces, edges, vertices, or bodies you care about,
   filtering by surface type, radius, axis, or area — occurrence-scoped for
   assemblies.
3. `measure` those exact entities: distance, wall thickness, draft, rays, point
   analysis, planar sections, or edge continuity.
4. `describe_pmi` to read the dimensions, geometric tolerances, and datums the file
   declares, each bound to the entities it applies to.
5. `diff` two revisions for dimension, volume, area, and topology deltas, plus
   parsed STEP metadata.

Every step carries a content-addressed artifact reference. The server rejects a
stale revision rather than applying old entity IDs to changed geometry, so a number
is always traceable to the exact bytes it came from.

## The five tools

- **`inspect`** — accepts a local artifact URI and returns its SHA-256 revision,
  bounding-box dimensions, volume and surface area, body/assembly structure, and
  B-rep validity with body/face/edge counts. Lengths are in the file's declared
  unit, which every result labels. Bounding boxes are conservative envelopes, and
  `volume` is null when the file has no solid material.
- **`find_entities`** — find faces, edges, vertices, or solid bodies. Face and edge
  searches support geometric filters; results are paginated and include the IDs used
  for later measurement.
- **`measure`** — distance between selected entity sets; wall thickness; draft
  against a pull direction; rays and ray grids; point analysis; planar sections; and
  edge continuity. Lengths are in the file's declared unit and angles in degrees.
  Required inputs depend on the measurement kind. Ray grids default to a 4000-ray
  cap; `max_rays` raises it to 20000 and the result reports the grid size, requested
  spacing, and cap used.
- **`describe_pmi`** — reports declared dimensions (nominal with deviations or
  bounds), geometric tolerances (value, zone shape, material requirement, datum
  references), and datums, with the entity IDs each annotation applies to. Every
  annotation carries a `pmi_kind` (`semantic`, `graphical-only`, or `none`) and a
  `value_resolved` flag, so a callout that could not be read is never mistaken for
  one that was.
- **`diff`** — new-minus-baseline deltas for overall dimensions, volume, surface
  area, and body/face/edge counts, along with parsed STEP schema, product, and
  authoring metadata.

## What the results mean

Results describe the nominal geometry and metadata in the supplied STEP files. They
do not recover the original CAD feature tree or establish design intent — those
belong to the engineer and to other capabilities, which is what keeps a measurement
a fact you can build on. The server is read-only: it never edits CAD files or
creates manufacturing instructions. It communicates with its host over local stdio
by default; the optional viewer artifact API is only needed by compatible viewer
integrations.

## Notes

- Imported geometry and measurements depend on what the source application exported
  to STEP; native feature history is not preserved by the format.
- Entity IDs are revision-scoped, not persistent semantic feature identifiers —
  Review named features carry identity across revisions where it matters.
- Large or complex models and exact geometry operations take longer than simple
  overview queries; test representative models before relying on latency.
- STEP import may fail for malformed files or unsupported producer-specific data.

See [Security](SECURITY.md) for local processing and handling CAD files as
sensitive, untrusted input.
