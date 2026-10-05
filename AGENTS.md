# CAD MCP Server — Agent Guide

Local-first, read-only MCP server for STEP CAD inspection. Returns factual geometry data so AI assistants can analyze mechanical engineering questions.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification.

## Prerequisites

- Node.js 24+
- CMake, Ninja, C++ compiler, and Python 3 (for native sidecar builds)
- [just](https://github.com/casey/just) command runner (optional, or use npm scripts directly)

## Setup

```bash
git clone https://github.com/mattmohandiss/cad-mcp-server.git
cd cad-mcp-server
just setup    # or: npm install
```

## Common Commands

| Command               | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `just setup`          | Install dependencies                                                |
| `just dev`            | Build and run server locally                                        |
| `just test`           | Run the Vitest suite                                                |
| `just lint`           | oxlint + TypeScript                                                 |
| `just fmt`            | Format source files with Prettier                                   |
| `just check`          | Run lint + test (pre-push hook runs this automatically)             |
| `just ci`             | Linux native sidecar build + integration tests                      |
| `just sidecar-native` | Build the OCCT sidecar for the current host                         |
| `just build`          | Compile the TypeScript server                                       |
| `just eval`           | Run LLM eval through Vercel AI Gateway (needs `AI_GATEWAY_API_KEY`) |
| `just setup-eval`     | Install eval Python dependencies into `.venv`                       |
| `just clean`          | Remove generated artifacts, deps, eval logs, eval work dirs         |
| `just check-clean`    | Verify no build artifacts remain (pre-PR check)                     |

Direct npm equivalents: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npx prettier --write`.

Sidecar integration tests are opt-in via `CAD_MCP_SIDECAR` and `CAD_MCP_TEST_STEP`; `CAD_MCP_SIDECAR_LAUNCHER` optionally selects a Cosmopolitan APE launcher.

## Code Conventions

- TypeScript strict mode throughout.
- Use `import`/`export` (ESM) — no CommonJS.
- oxlint + Prettier enforce style (single quotes, trailing commas, 100 width).
- Follow existing patterns in `src/` — look at neighboring files.
- `.js` extension in all relative imports (Node.js ESM requirement).
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.) — release-please uses these to determine version bumps and generate the CHANGELOG. Don't write commit messages like "added new feature" without a prefix.

## Project Layout

See `docs/ARCHITECTURE.md` for system design, and `docs/SECURITY.md` for security model.

Key directories:

- `src/` — MCP server source (tools/, sidecar/, artifacts/, pmi/, types/, tests/)
- `occt/sidecar/` — OCCT sidecar C++ source and native/Cosmopolitan build scripts
- `eval/` — LLM eval runner and 20 prompt scenarios
- `docs/` — Project documentation
- `.github/workflows/` — CI and release automation

## Development

Run the MCP server locally:

```bash
just dev
```

Before geometry calls, build the sidecar and point the runtime at it:

```bash
just sidecar-native
CAD_MCP_SIDECAR=occt/sidecar/build-work/native/occt-sidecar just dev
```

**TypeScript build only (quick, no kernel):**

```bash
npm run build
```

The optional viewer artifact API is embedded in the MCP server with `just dev -- --viewer-api=http`.

## Pull Request Process

1. Run `just check` for fast local checks.
2. Run `just ci` before pushing sidecar/kernel-sensitive changes; it builds the native sidecar and enables fixture-backed integration tests.
3. Open a PR to `main` and wait for the required check status.
4. Keep changes focused — avoid broad refactors unless discussed.
5. Update tests for any new or changed functionality.
6. Follow the existing code style (enforced by Prettier and oxlint).
7. Use conventional commit messages.

## Release Workflow

Releases are automated through release-please and npm trusted publishing. Do not manually bump versions, edit changelog entries, or run `npm publish` for normal releases.

1. PR CI validates changes before merge (fast checks, registry metadata, dependency review, Cosmopolitan build, and cross-platform MCP smoke tests).
2. On each push to `main`, the trusted release workflow restores or seeds the Cosmopolitan payload cache before release-please opens or updates its release PR.
3. Release PR CI runs the same cross-platform workflow checks and registry metadata validation.
4. Review and merge the release PR.
5. Merging the release PR creates the GitHub Release/tag before downstream publication completes. The workflow reuses the cached sidecar, builds the Apple Silicon launcher, smoke-tests the packed CLI, then publishes to npm and the MCP Registry. If a downstream job fails, the GitHub Release/tag may already exist; rerun the failed job after resolving the cause.

**Version rules (automatic, no manual bumps):**

- `feat:` → minor bump, `fix:` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major (post-1.0) or minor (pre-1.0)
- Forgetting the prefix means no Release PR is opened — silent failure

**CI layers from cheapest → expensive:**

1. **pre-commit** (lint-staged): prettier + oxlint on staged files (~1s)
2. **pre-push** (husky): `just check` (~30s)
3. **PR CI**: unit checks + registry metadata + dep-review, then build the Cosmopolitan sidecar once and smoke-test the packed server on Linux x64, macOS x64/arm64, and Windows x64
4. **Main push**: restore/build and save the trusted payload cache before release-please runs; later release PR checks can restore it
5. **Release PR CI**: repeat cross-platform package checks using the main-scoped cached payload
6. **Release PR merge**: create GitHub Release/tag, reuse cached sidecar, smoke-test and publish to npm/MCP Registry; failed downstream jobs are rerunnable

## Sidecar Build Notes

- `occt/sidecar/scripts/build.py` builds against pinned OCCT 8.0.1 and Cosmopolitan inputs.
- The sidecar payload cache hashes `occt/sidecar/**`, including the payload packaging script; ccache is the fallback when the finished-payload cache misses.
- `package_cosmopolitan_payload.py` assembles the cacheable runtime payload; the macOS ARM launcher is built separately from that payload.
- Sidecar build outputs under `occt/sidecar/build*` are generated artifacts — do not commit.

## Trusted Publishing

npm publish uses OIDC trusted publishing — no `NPM_TOKEN` secret needed. The release-please workflow authenticates to npm via GitHub's OIDC. The npm-side trust config is in your npm package settings; the GitHub workflow file is `release-please.yml`.

`RELEASE_PLEASE_TOKEN` is a classic PAT with `contents: write` and `pull_requests: write` scopes, stored as a repository secret. release-please uses it instead of the default `GITHUB_TOKEN` so that CI workflows run on release PRs (by design, `GITHUB_TOKEN`-triggered events don't spawn new workflow runs).

## Dependabot

Dependabot opens weekly PRs for:

- npm production deps (grouped)
- npm dev deps (minor + patch only, grouped)
- GitHub Actions versions (tag-pinned)

Enable auto-merge for Dependabot PRs in repo settings (Settings → Code security and analysis → Dependabot → Enable auto-merge for version updates). Dependabot PRs that pass CI merge themselves.

## npm Distribution

The npm package (`cad-mcp-server`) should stay minimal. Include only:

- `dist/` — compiled JS and packaged OCCT sidecar executable/launchers
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/EXAMPLE_PROMPTS.md`, `server.json`

Do not include test files, source maps, or development configuration in the package.

The official runtime support matrix is Linux x64, macOS x64/arm64, and Windows x64. npm's independent `os` and `cpu` allowlists cannot encode that exact matrix, so support is documented here and verified by CI rather than approximated with overly broad package metadata.
