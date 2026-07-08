# CAD MCP Server — Agent Guide

Local-first, read-only MCP server for STEP CAD inspection. Returns factual geometry data so AI assistants can analyze mechanical engineering questions.

## Product Rules

- MCP tools return measured or parsed facts, not pre-baked engineering conclusions.
- The LLM performs interpretation; the server provides evidence.
- Keep the public tool surface small, stable, and read-only.
- Do not add CAD editing, CAM generation, arbitrary kernel execution, or manufacturability certification.

## Prerequisites

- Node.js 24+
- Docker or Podman (for WASM kernel builds)
- [just](https://github.com/casey/just) command runner (optional, or use npm scripts directly)

## Setup

```bash
git clone https://github.com/mattmohandiss/cad-mcp-server.git
cd cad-mcp-server
just setup    # or: npm install
```

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
| `just eval`        | Run LLM eval through Vercel AI Gateway (needs `AI_GATEWAY_API_KEY`) |
| `just setup-eval`  | Install eval Python dependencies into `.venv`                       |
| `just clean`       | Remove generated artifacts, deps, eval logs, eval work dirs         |
| `just check-clean` | Verify no build artifacts remain (pre-PR check)                     |

Direct npm equivalents: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npx prettier --write`.

All default tests use Vitest and focus on the TypeScript/MCP surface. Kernel-backed checks are kept out of the default loop; use `just ci` or evals when validating kernel-sensitive changes.

## Code Conventions

- TypeScript strict mode throughout.
- Use `import`/`export` (ESM) — no CommonJS.
- ESLint + Prettier enforce style (single quotes, trailing commas, 100 width).
- Follow existing patterns in `src/` — look at neighboring files.
- `.js` extension in all relative imports (Node.js ESM requirement).
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.) — release-please uses these to determine version bumps and generate the CHANGELOG. Don't write commit messages like "added new feature" without a prefix.

## Project Layout

See `docs/ARCHITECTURE.md` for system design, and `docs/SECURITY.md` for security model.

Key directories:

- `src/` — MCP server source (tools/, query/, kernel/, pmi/, types/, tests/)
- `occt/` — OCCT WebAssembly kernel source (facade/, codegen/Rust, ts/ bindings)
- `eval/` — LLM eval runner and 20 prompt scenarios
- `scripts/` — Build and validation scripts
- `docs/` — Project documentation
- `.github/workflows/` — CI and release automation

## Development

Run the server locally:

```bash
just dev      # or: npm run dev
```

**TypeScript build only (quick):**

```bash
npm run build
```

**Full build with WASM kernel (requires Docker):**

```bash
just build
```

## Pull Request Process

1. Run `just check` before pushing normal changes.
2. Run `just ci` before release-sensitive changes or when touching the WASM/kernel path.
3. Open a PR to `main` and wait for the required check status.
4. Keep changes focused — avoid broad refactors unless discussed.
5. Update tests for any new or changed functionality.
6. Follow the existing code style (enforced by Prettier and ESLint).
7. Use conventional commit messages.

## Release Workflow

Releases are automated through release-please and npm trusted publishing. Do not manually bump versions, edit changelog entries, or run `npm publish` for normal releases.

1. Merge feature and fix PRs into `main` (CI runs `just check`, registry metadata validation, and dep-review).
2. release-please opens or updates a release PR with the version bump and changelog.
3. Release PR CI runs `just check` and registry metadata validation.
4. Review and merge the release PR.
5. The release workflow creates the GitHub Release, builds optimized WASM, runs kernel tests, smoke-tests the packed CLI, publishes to npm, and publishes to the MCP Registry (with retry for npm propagation lag).

**Version rules (automatic, no manual bumps):**

- `feat:` → minor bump, `fix:` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major (post-1.0) or minor (pre-1.0)
- Forgetting the prefix means no Release PR is opened — silent failure

**CI layers from cheapest → expensive:**

1. **pre-commit** (lint-staged): prettier + eslint on staged files (~1s)
2. **pre-push** (husky): `just check` (~30s)
3. **PR CI** (pull request to main): `just check` + registry metadata + dep-review (~30s)
4. **Release PR CI** (release-please PR): `just check` + registry metadata (~30s)
5. **release-please merge**: optimized WASM build + kernel tests + packed-CLI smoke + npm + MCP Registry publish (~6min)

## Kernel Build Notes

- `occt/Dockerfile.builder` builds pinned OCCT 8.0.0 static libs (rarely changes).
- `occt/Dockerfile` builds the WASM facade + TS package (changes more often).
- Generated C++ files in `occt/facade/generated/` are build artifacts — do not commit.
- WASM outputs (`occt/dist/`, `occt/ts/dist/`, `*.wasm`) are build artifacts — do not commit.

## Trusted Publishing

npm publish uses OIDC trusted publishing — no `NPM_TOKEN` secret needed. The release-please workflow authenticates to npm via GitHub's OIDC. The npm-side trust config is in your npm package settings; the GitHub workflow file is `release-please.yml`.

`RELEASE_PLEASE_TOKEN` is a classic PAT with `contents: write` and `pull_requests: write` scopes, stored as a repository secret. release-please uses it instead of the default `GITHUB_TOKEN` so that CI workflows run on release PRs (by design, `GITHUB_TOKEN`-triggered events don't spawn new workflow runs).

## Dependabot

Dependabot opens weekly PRs for:

- npm production deps (grouped)
- npm dev deps (minor + patch only, grouped)
- cargo deps in `occt/codegen/`
- GitHub Actions versions (tag-pinned, e.g. `actions/checkout@v5`)

Enable auto-merge for Dependabot PRs in repo settings (Settings → Code security and analysis → Dependabot → Enable auto-merge for version updates). Dependabot PRs that pass CI merge themselves.

## npm Distribution

The npm package (`cad-mcp-server`) should stay minimal. Include only:

- `dist/` — compiled JS
- `node_modules/occt-wasm/` — bundled WASM kernel
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/EXAMPLE_PROMPTS.md`, `server.json`

Do not include test files, source maps, or development configuration in the package.
