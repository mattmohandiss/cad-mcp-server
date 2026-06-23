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

1. Run `just lint` and `just test` before committing.
2. Keep changes focused — avoid broad refactors unless discussed.
3. Update tests for any new or changed functionality.
4. Follow the existing code style (enforced by Prettier and ESLint).
5. Use conventional commit messages.

## Code Style

- TypeScript strict mode, ESM modules (`.js` extensions in imports).
- Single quotes, trailing commas, 100 print width (enforced by Prettier).
- Follow the patterns in `src/` for consistency.

## Project Structure

See `docs/ARCHITECTURE.md` for a system design overview, and `AGENTS.md` for build commands and conventions used by AI coding tools.
