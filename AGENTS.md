# CAD MCP Server — Agent Guide

Local-first, read-only MCP server for STEP CAD inspection. Returns factual geometry data so AI assistants can analyze mechanical engineering questions.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification.

## Common Commands

| Command | Purpose |
|---------|---------|
| `just setup` | Install dependencies |
| `just dev` | Build and run server locally |
| `just test` | Run test suite (vitest) |
| `just lint` | TypeScript typecheck, ESLint, Prettier |
| `just build` | Build optimized WASM kernel + npm tarball |
| `just clean` | Remove generated artifacts and dependencies |

Direct npm equivalents: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run fmt`.

## Code Conventions

- TypeScript strict mode throughout.
- Use `import`/`export` (ESM) — no CommonJS.
- ESLint + Prettier enforce style (single quotes, trailing commas, 100 width).
- Follow existing patterns in `src/` — look at neighboring files.
- `.js` extension in all relative imports (Node.js ESM requirement).

## Project Layout

```
src/                   MCP server source
  tools/               Tool handlers and schemas
  query/               Query services (face/edge/PMI search)
  kernel/              OCCT WASM kernel bindings
  pmi/                 Lightweight STEP PMI parsers
  types/               TypeScript type definitions
  tests/               Vitest test suite
  index.ts             Server entry point
occt/                  OCCT WebAssembly kernel source
  Dockerfile.builder   OCCT static library build
  Dockerfile           Stripped facade + TS package build
  codegen/             Rust code generator for C++ facade
  facade/              C++ OCCT binding layer
  ts/                  TypeScript wrapper for WASM module
docs/                  Project documentation
```

## Kernel Build Notes

- `occt/Dockerfile.builder` builds pinned OCCT 8.0.0 static libs (rarely changes).
- `occt/Dockerfile` builds the WASM facade + TS package (changes more often).
- Generated C++ files in `occt/facade/generated/` are build artifacts — do not commit.
- WASM outputs (`occt/dist/`, `occt/ts/dist/`, `*.wasm`) are build artifacts — do not commit.

## npm Distribution

The npm package (`cad-mcp-server`) should stay minimal. Include only:
- `dist/` — compiled JS
- `node_modules/occt-wasm/` — bundled WASM kernel
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/EXAMPLE_PROMPTS.md`

Do not include test files, source maps, or development configuration in the package.
