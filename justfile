default:
	just --list

# Install root MCP dependencies and local occt-wasm package dependencies
setup:
	npm install
	cd occt/ts && npm install

# Build and run the MCP server locally
dev:
	npm run build
	node dist/index.js

# Build the optimized distribution tarball for npm/manual install
build: _build-wasm-builder _build-wasm-release _build-server _pack

# Build the OCCT WASM kernel and copy artifacts into occt/dist + occt/ts/dist.
# Used by CI to enable kernel-touching tests on main. Requires Docker or podman.
build-wasm:
	if command -v podman &>/dev/null; then \
	  cd occt && podman build -t occt-wasm-builder -f Dockerfile.builder .; \
	else \
	  cd occt && docker build -t occt-wasm-builder -f Dockerfile.builder .; \
	fi
	if command -v podman &>/dev/null; then \
	  cd occt && podman build --build-arg ENABLE_WASM_OPT=0 -t occt-wasm .; \
	  cid=$$(podman create occt-wasm); \
	  mkdir -p occt/dist occt/ts/dist; \
	  podman cp $$cid:/workspace/dist/. occt/dist/; \
	  podman cp $$cid:/workspace/ts/dist/. occt/ts/dist/; \
	  podman rm $$cid; \
	else \
	  cd occt && docker build --build-arg ENABLE_WASM_OPT=0 -t occt-wasm .; \
	  cid=$$(docker create occt-wasm); \
	  mkdir -p occt/dist occt/ts/dist; \
	  docker cp $$cid:/workspace/dist/. occt/dist/; \
	  docker cp $$cid:/workspace/ts/dist/. occt/ts/dist/; \
	  docker rm $$cid; \
	fi

# Run the LLM eval suite against all models × questions. Requires
# OPENROUTER_API_KEY in env or eval/.env. Builds the server first.
eval: _build-server
	npx tsx eval/runner/index.ts

# Run the integration test suite
test:
	npm test

# Run static validation for TypeScript, Rust codegen, and facade consistency
lint: _validate-facade _lint-ts _lint-rs

# Run all local checks
check: lint test

# Format all TypeScript source + config files
fmt:
	npx prettier --write "src/**/*.ts" "eval/**/*.ts" occt/ts/src/ occt/ts/eslint.config.js eslint.config.js tsconfig.json vitest.config.ts

# Check formatting without writing
fmt-check:
	npx prettier --check "src/**/*.ts" "eval/**/*.ts" occt/ts/src/ occt/ts/eslint.config.js eslint.config.js tsconfig.json vitest.config.ts

# Remove generated artifacts and installed dependencies
clean:
	rm -rf dist node_modules occt/ts/node_modules occt/dist occt/build occt/ts/dist occt/*.tgz *.tgz tests/eval-logs

# Verify no build artifacts or tarballs remain (for pre-PR check)
check-clean:
	@! test -d dist && echo "✅ dist/ clean" || { echo "❌ dist/ still exists"; exit 1; }
	@! test -f *.tgz && echo "✅ no root .tgz" || { echo "❌ root .tgz found"; exit 1; }
	@! test -f occt/*.tgz && echo "✅ no occt .tgz" || { echo "❌ occt .tgz found"; exit 1; }
	@! test -d tests/eval-logs && echo "✅ eval-logs/ clean" || { echo "❌ tests/eval-logs/ still exists"; exit 1; }
	@echo "🎉 Clean check passed"

# Internal: build root MCP server TypeScript
_build-server:
	npm run build

# Internal: produce npm package tarball
_pack:
	npm pack

# Internal: build optimized occt-wasm and copy package artifacts into occt/ts/dist
_build-wasm-release:
	if command -v podman &>/dev/null; then \
	  cd occt && podman build --build-arg ENABLE_WASM_OPT=1 -t occt-wasm .; \
	else \
	  cd occt && docker build --build-arg ENABLE_WASM_OPT=1 -t occt-wasm .; \
	fi
	mkdir -p occt/dist
	rm -rf occt/ts/dist && mkdir -p occt/ts/dist
	if command -v podman &>/dev/null; then \
	  cid=$(podman create occt-wasm); \
	  podman cp $cid:/workspace/dist/. occt/dist/; \
	  podman cp $cid:/workspace/ts/dist/. occt/ts/dist/; \
	  podman rm $cid; \
	else \
	  cid=$(docker create occt-wasm); \
	  docker cp $cid:/workspace/dist/. occt/dist/; \
	  docker cp $cid:/workspace/ts/dist/. occt/ts/dist/; \
	  docker rm $cid; \
	fi
	cd occt/ts && npm pack --pack-destination ..
	rm -rf node_modules/occt-wasm
	npm install ./occt/occt-wasm-*.tgz --no-save --package-lock=false --force

# Internal: build pinned OCCT 8.0.0 static-lib builder image
_build-wasm-builder:
	if command -v podman &>/dev/null; then \
	  cd occt && podman build -t localhost/occt-wasm-builder -f Dockerfile.builder .; \
	else \
	  cd occt && docker build -t localhost/occt-wasm-builder -f Dockerfile.builder .; \
	fi

# Internal: regenerate generated C++ facade after editing codegen config
_codegen:
	cd occt/codegen && cargo run

# Internal: cross-reference facade methods across config.rs, header, and TS files
_validate-facade:
	scripts/validate-facade.sh

# Internal: lint and type-check TypeScript packages
_lint-ts:
	npm run lint
	cd occt/ts && npx eslint src/
	cd occt/ts && npx tsc
	npx tsc --noEmit

# Internal: lint Rust codegen package
_lint-rs:
	cd occt/codegen && PATH="$HOME/.cargo/bin:$PATH" cargo fmt --check && PATH="$HOME/.cargo/bin:$PATH" cargo clippy -- -D warnings
