# How CAD MCP works

CAD MCP gives an MCP host access to measured facts about local STEP geometry. It uses Open CASCADE for geometry operations and returns structured results for the host and language model to interpret.

## Typical workflow

1. Call `inspect` with a local `file:` URI to get overall dimensions, volume, surface area, model structure, B-rep health, and a content-revision-bound artifact reference.
2. Pass that exact artifact reference to `find_entities` to locate faces, edges, vertices, or solid bodies. For assemblies, use occurrence names returned by `inspect` to scope the search.
3. Pass the same artifact reference and exact entity IDs returned by `find_entities` to `measure`. The server rejects a stale revision rather than applying IDs to changed geometry.
4. Use `diff` with baseline and candidate STEP URIs to compare overall geometry and STEP metadata; results identify both input revisions.

Entity IDs are local to a model revision and ID scheme. Copy both the artifact reference and IDs from tool results; do not assume an ID identifies the same geometric feature in another revision or kernel.

## The four tools

- **`inspect`** — accepts a local artifact URI and returns its SHA-256 revision, bounding-box dimensions, volume and surface area, body/assembly structure, and B-rep validity with body/face/edge counts. Geometry lengths are in the file's declared unit, which every result labels. Bounding boxes are conservative envelopes, and `volume` is null when the file has no solid material.
- **`find_entities`** — find faces, edges, vertices, or solid bodies. Face and edge searches support geometric filters; results are paginated and include IDs for later measurement.
- **`measure`** — distance between selected entity sets; wall thickness; draft against a pull direction; rays and ray grids; point analysis; planar sections; and edge continuity. Lengths are in the file's declared unit and angles in degrees. Required inputs depend on the selected measurement kind. Ray grids default to a 4000-ray cap; `max_rays` raises it to 20000 and the result reports grid size, requested spacing and the cap used.
- **`diff`** — new-minus-baseline deltas for overall dimensions, volume, surface area, and body/face/edge counts, along with parsed STEP schema, product, and authoring metadata.

## What the results mean

Results describe the nominal geometry and metadata available in the supplied STEP files. They do not recover the original CAD feature tree, establish design intent, or determine whether a part meets a drawing, tolerance, material, process, safety, or compliance requirement. Those conclusions require additional evidence and engineering judgment.

The server is read-only: it does not edit CAD files or create manufacturing instructions. It communicates with its host over local stdio by default. The optional viewer artifact API is only needed by compatible viewer integrations.

## Limitations

- Imported geometry and measurements depend on what the source application exported to STEP; native feature history and all design intent are not preserved by the format.
- Entity IDs are revision-scoped, not persistent semantic feature identifiers.
- Large or complex models and exact geometry operations can take longer than simple overview queries. Test representative models before relying on latency expectations.
- STEP import may fail for malformed files or unsupported producer-specific data.

See [Security](SECURITY.md) for local processing assumptions and handling CAD files as sensitive, untrusted input.
