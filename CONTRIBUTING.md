# Contributing

## Prerequisites

- Node.js 22+
- Docker (for WASM kernel builds)
- [just](https://github.com/casey/just) command runner (optional, or use npm scripts directly)

## Setup

```bash
git clone https://github.com/mattmohandiss/cad-mcp-server.git
cd cad-mcp-server
just setup    # or: npm install
```

## Development

Run the server locally with hot reload:

```bash
just dev      # or: npm run dev
```

## Testing

```bash
just test     # or: npm test
```

All tests use Vitest. Integration tests load real STEP files from `samples/` and require a built WASM kernel.

## Linting and Type Checking

```bash
just lint     # typecheck + ESLint + Prettier
```

## Building

### TypeScript only (quick):

```bash
npm run build
```

### Full build with WASM kernel (requires Docker):

```bash
just build
```

This builds the OCCT WebAssembly kernel via Docker, compiles TypeScript, and produces an npm tarball.

## Pull Request Process

1. Run `just check` before pushing normal changes.
2. Run `just ci` before release-sensitive changes or when touching the WASM/kernel path.
3. Open a PR to `main` and wait for the required `check` status.
4. Keep changes focused — avoid broad refactors unless discussed.
5. Update tests for any new or changed functionality.
6. Follow the existing code style (enforced by Prettier and ESLint).
7. Use conventional commit messages.

## Release Workflow

Releases are automated through release-please and npm trusted publishing. Do not manually
bump versions, edit changelog entries, or run `npm publish` for normal releases.

1. Merge feature and fix PRs into `main`.
2. release-please opens or updates a release PR with the version bump and changelog.
3. Review and merge the release PR when CI is green.
4. The release workflow creates the GitHub Release, builds the optimized WASM package, runs tests, and publishes `cad-mcp-server` to npm with provenance.

The only manual gate is merging PRs. Dependabot and release-please PRs should behave like normal PRs and run CI automatically.

## Code Style

- TypeScript strict mode, ESM modules (`.js` extensions in imports).
- Single quotes, trailing commas, 100 print width (enforced by Prettier).
- Follow the patterns in `src/` for consistency.

## Project Structure

See `docs/ARCHITECTURE.md` for a system design overview, and `AGENTS.md` for build commands and conventions used by AI coding tools.
