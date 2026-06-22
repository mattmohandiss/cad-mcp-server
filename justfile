default:
	just --list

# ── Project setup ─────────────────────────────────────────────────────────

# Initialize submodules after clone
init:
	git submodule update --init --recursive

# Full setup: submodules + npm deps (root + kernel/ts)
setup: init
	npm install
	cd kernel/ts && npm install

# ── Build ─────────────────────────────────────────────────────────────────

# Build the MCP server (TypeScript → dist/)
build:
	npm run build

# Build occt-wasm kernel via OCI-compatible container engine (podman preferred, docker fallback)
build-wasm:
	if command -v podman &>/dev/null; then \
	  cd kernel && podman build --no-cache -t occt-wasm .; \
	else \
	  cd kernel && docker build --no-cache -t occt-wasm .; \
	fi

# Regenerate C++ facade from codegen config (after editing config.rs)
codegen:
	cd kernel && cargo run -- codegen

# ── Validation ────────────────────────────────────────────────────────────

# Cross-reference facade methods across config.rs, header, and TS files
validate-facade:
	scripts/validate-facade.sh

# Lint TypeScript (MCP server + kernel)
ts-lint:
	npm run lint
	cd kernel/ts && npx tsc --noEmit
	cd kernel/ts && npx eslint src/

# Lint Rust (kernel codegen + crate)
rs-lint:
	cd kernel && if command -v cargo &>/dev/null; then cargo fmt --check; cargo clippy 2>&1 | grep -v "^$" | grep -v "warning:" | head -5 || true; else echo "  (cargo not found - skip rs-lint)"; fi

# Format C++ (facade source + generated)
cpp-fmt:
	clang-format --dry-run -Werror kernel/facade/src/kernel.cpp kernel/facade/include/occt_kernel.h 2>&1 || echo "  (clang-format check skipped if clang-format not in PATH)"

# TypeScript type-check (kernel + MCP server)
ts-check:
	cd kernel/ts && npx tsc --noEmit
	npx tsc --noEmit

# Full check: run ALL validation and linting
check: validate-facade ts-lint rs-lint ts-check

# ── Development ───────────────────────────────────────────────────────────

dev:
	npm run build && node dist/index.js

watch:
	npm run watch

test:
	npm test

fmt:
	npm run fmt

# ── Cleanup ───────────────────────────────────────────────────────────────

clean:
	rm -rf dist node_modules
