# CAD MCP Server — Agent Guide

Local-first, read-only MCP server for STEP CAD inspection. Returns factual geometry data so AI assistants can analyze mechanical engineering questions.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification.

## Common Commands

| Command            | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `just setup`       | Install dependencies                                                |
| `just dev`         | Build and run server locally                                        |
| `just test`        | Run test suite (vitest) — kernel tests skip if WASM not built       |
| `just lint`        | TypeScript + Rust lint, facade validation, Prettier                 |
| `just fmt`         | Format source files with Prettier                                   |
| `just check`       | Run lint + test (pre-push hook runs this automatically)             |
| `just ci`          | Full local pipeline: lint + tests + WASM build + tests with kernel  |
| `just build-wasm`  | Build OCCT WASM kernel (Docker) into occt/dist + occt/ts/dist       |
| `just build`       | Build optimized WASM kernel + npm tarball                           |
| `just eval`        | Run LLM eval against OpenRouter models (needs `OPENROUTER_API_KEY`) |
| `just clean`       | Remove generated artifacts, deps, eval logs                         |
| `just check-clean` | Verify no build artifacts remain (pre-PR check)                     |

Direct npm equivalents: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npx prettier --write`.

## Code Conventions

- TypeScript strict mode throughout.
- Use `import`/`export` (ESM) — no CommonJS.
- ESLint + Prettier enforce style (single quotes, trailing commas, 100 width).
- Follow existing patterns in `src/` — look at neighboring files.
- `.js` extension in all relative imports (Node.js ESM requirement).
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.) — release-please uses these to determine version bumps and generate the CHANGELOG. Don't write commit messages like "added new feature" without a prefix.

## Project Layout

```
src/                   MCP server source
  tools/               Tool handlers and schemas (inspect, query, diff, transact)
  query/               Query services (face/edge/PMI search, aggregates, pipeline)
  kernel/              OCCT WASM kernel bindings
  pmi/                 Lightweight STEP PMI parsers
  types/               TypeScript type definitions
  tests/               Vitest test suite
  index.ts             Server entry point
samples/               STEP test fixtures
occt/                  OCCT WebAssembly kernel source
  Dockerfile.builder   OCCT static library build
  Dockerfile           Stripped facade + TS package build
  codegen/             Rust code generator for C++ facade
  facade/              C++ OCCT binding layer
  ts/                  TypeScript wrapper for WASM module
eval/                  LLM eval runner and prompts
scripts/               Build and validation scripts
docs/                  Project documentation
justfile               Developer workflow recipes
server.json            MCP Registry metadata
package.json           npm package metadata
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
git commit -m "feat: ..."   # or fix: / chore: / docs: / refactor: / etc.
git push            # pre-push hook runs `just check` automatically
```

**Release:**

```bash
git checkout dev
# feature work is already on dev; PR dev → main
gh pr create --base main
# wait for CI (just check — WASM already validated on original PR)
# merge the PR
# release-please bot opens a Release PR with version bump + CHANGELOG
# review the Release PR (verifies version, checks the diff)
# optionally: just eval (~$2, 15min) for confirmation
gh pr merge <release-pr-number>  # auto-publishes to npm and MCP Registry
```

**What release-please does automatically:**

- Bumps `version` in `package.json` and `server.json` based on commit types
- Updates `CHANGELOG.md` from commit messages
- Tags the release on merge
- Publishes to npm (provenance auto-generated via OIDC trusted publishing)
- Publishes to MCP Registry via `mcp-publisher` (retries on npm propagation lag)
- Creates a GitHub Release

**The version bump is automatic based on commit types:**

- `feat:` → minor bump (0.2.0 → 0.3.0)
- `fix:` → patch bump (0.2.0 → 0.2.1)
- `feat!:` or `BREAKING CHANGE:` → minor bump (pre-1.0) or major (post-1.0)

If you forget the conventional commit prefix, no Release PR is opened. Silent. Use `feat:`, `fix:`, etc.

**Pre-release verification (mirrors what CI does):**

```bash
just ci            # lint + tests + WASM build + tests with kernel
```

**The five checks layered from cheap → expensive:**

1. **pre-commit** (lint-staged): prettier + eslint on staged files (~1s)
2. **pre-push** (husky): `just check` — full lint + vitest (~30s, no Docker)
3. **PR CI** (pull request to main): `just check` + dep-review + WASM build + kernel tests (~3min)
4. **Release PR CI** (release-please PR): `just check` only (~30s)
5. **release-please** (release PR merge): optimized WASM build + kernel tests + packed-CLI smoke test + npm publish + MCP Registry publish with retry (~6min)

## Trusted publishing

npm publish uses OIDC trusted publishing — no `NPM_TOKEN` secret needed. The release-please workflow authenticates to npm via GitHub's OIDC. The npm-side trust config is in your npm package settings; the GitHub workflow file is `release-please.yml`.

`RELEASE_PLEASE_TOKEN` is a classic PAT with `contents: write` and `pull_requests: write` scopes, stored as a repository secret. release-please uses it instead of the default `GITHUB_TOKEN` so that CI workflows run on release PRs (by design, `GITHUB_TOKEN`-triggered events don't spawn new workflow runs).

## Dependabot

Dependabot opens weekly PRs for:

- npm production deps (grouped)
- npm dev deps (minor + patch only, grouped)
- cargo deps in `occt/codegen/`
- GitHub Actions versions (SHA-pinned, Dependabot updates the SHA + version comment)

Enable auto-merge for Dependabot PRs in repo settings (Settings → Code security and analysis → Dependabot → Enable auto-merge for version updates). Dependabot PRs that pass CI merge themselves.

## npm Distribution

The npm package (`cad-mcp-server`) should stay minimal. Include only:

- `dist/` — compiled JS
- `node_modules/occt-wasm/` — bundled WASM kernel
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/EXAMPLE_PROMPTS.md`

Do not include test files, source maps, or development configuration in the package.
