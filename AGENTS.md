# CAD MCP Server — Agent Guide

Local-first, read-only MCP server for STEP CAD inspection. Returns factual geometry data so AI assistants can analyze mechanical engineering questions.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification.

## Common Commands

| Command            | Purpose                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `just setup`       | Install dependencies                                                                   |
| `just dev`         | Build and run server locally                                                           |
| `just test`        | Run test suite (vitest) — kernel tests skip if WASM not built                          |
| `just lint`        | TypeScript typecheck, ESLint, Prettier                                                 |
| `just fmt`         | Format source files with Prettier                                                      |
| `just fmt-check`   | Check formatting without writing                                                       |
| `just check`       | Run lint + test (pre-commit)                                                           |
| `just build-wasm`  | Build OCCT WASM kernel (Docker) and copy artifacts into `occt/dist` and `occt/ts/dist` |
| `just build`       | Build optimized WASM kernel + npm tarball                                              |
| `just eval`        | Run LLM eval against OpenRouter models (needs `OPENROUTER_API_KEY`)                    |
| `just clean`       | Remove generated artifacts, deps, eval logs                                            |
| `just check-clean` | Verify no build artifacts remain (pre-PR)                                              |

Direct npm equivalents: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npx prettier --write`.

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

## Workflow

Two branches: `main` (production, protected) and `dev` (integration). No feature branches for solo work.

**Day-to-day:**

```bash
git checkout dev
# edit
just check          # or rely on the pre-push hook to do it
git add -p          # review the diff
git commit -m "..."
git push            # pre-push hook runs `just check` automatically
```

**Release:**

```bash
git checkout dev
# bump version in package.json, update CHANGELOG.md
just eval                          # ~15min, real API calls, costs ~$2
git commit -m "release: v0.x.y" && git push
gh pr create --base main --head dev
# CI runs full suite on the release PR (lint + WASM + kernel tests)
# once green, merge (no force-push, status check required — ruleset enforces)
git checkout main && git pull
git tag v0.x.y && git push --tags   # triggers publish.yml
```

**Pre-release verification (mirrors what CI does):**

```bash
just ci            # lint + tests + WASM build + tests with kernel
```

**The four checks layered from cheap → expensive:**

1. **pre-commit** (lint-staged): prettier + eslint on staged files (~1s)
2. **pre-push** (husky): `just check` — full lint + vitest (~30s, no Docker)
3. **PR CI** on `dev`: `just lint && npm test` (~30s, no WASM build)
4. **main CI** (push to main or release PR): full suite incl. WASM build + kernel tests (~3min warm)

## npm Distribution

The npm package (`cad-mcp-server`) should stay minimal. Include only:

- `dist/` — compiled JS
- `node_modules/occt-wasm/` — bundled WASM kernel
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/EXAMPLE_PROMPTS.md`

Do not include test files, source maps, or development configuration in the package.
