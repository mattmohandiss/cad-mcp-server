# Contributor Notes

## Project Goal

CAD MCP Server is a local-first, read-only MCP server for STEP CAD inspection. It returns factual geometry data so AI assistants can reason about mechanical engineering questions without modifying CAD files.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification to the core server.

## Kernel

- The OCCT WebAssembly kernel source lives in `occt/`.
- `occt/Dockerfile.builder` builds the pinned OCCT static-library builder image.
- `occt/Dockerfile` builds the stripped facade and TypeScript package.
- Generated facade files in `occt/facade/generated/` are intentionally tracked.
- Build outputs such as `occt/dist/`, `occt/ts/dist/`, `occt/target/`, and `*.tgz` are generated artifacts and should not be committed.

## Common Commands

- `just setup` installs dependencies.
- `just dev` builds and runs the server locally.
- `just test` runs the test suite.
- `just lint` runs static checks.
- `just build` builds the optimized kernel and npm tarball.
- `just clean` removes generated artifacts and dependencies.

## Distribution

The npm package should stay user-facing and minimal. It should include runtime files, the bundled `occt-wasm` artifacts, `README.md`, `THIRD_PARTY_NOTICES.md`, and user-facing examples only.
