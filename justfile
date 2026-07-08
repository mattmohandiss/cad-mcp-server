default:
	just --list

# Install root MCP dependencies and local occt-wasm package dependencies
setup:
	npm install
	cd occt/ts && npm install

# Build and run the MCP server locally
dev:
	npm run build
	node dist/src/index.js

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
	  cid=$(podman create occt-wasm); \
	  mkdir -p occt/dist occt/ts/dist; \
	  podman cp $cid:/workspace/dist/. occt/dist/; \
	  podman cp $cid:/workspace/ts/dist/. occt/ts/dist/; \
	  podman rm $cid; \
	else \
	  cd occt && docker build --build-arg ENABLE_WASM_OPT=0 -t occt-wasm .; \
	  cid=$(docker create occt-wasm); \
	  mkdir -p occt/dist occt/ts/dist; \
	  docker cp $cid:/workspace/dist/. occt/dist/; \
	  docker cp $cid:/workspace/ts/dist/. occt/ts/dist/; \
	  docker rm $cid; \
	fi

# Run the LLM eval suite against all models × scenarios. Requires
# AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN. Builds the server first.
eval: _ensure-eval-env _build-server
	npx tsx eval/runner/index.ts

# Run the integration test suite
test:
	npm test

# Run static validation for TypeScript, Rust codegen, and facade consistency
lint: _validate-facade _lint-ts _lint-rs

# Run all local checks
check: fmt-check lint test

# Run the full CI pipeline locally: lint + unit tests, build the WASM
# kernel, then re-run tests with kernel tests active. Use this before
# opening a release PR to verify the full suite passes.
ci: check build-wasm test

# Install eval Python dependencies into .venv
setup-eval:
	if command -v python3 >/dev/null 2>&1; then py=python3; else py=python; fi; \
	cd eval && "$py" -m venv .venv && .venv/bin/pip install -r requirements.txt

_ensure-eval-env:
	@test -x eval/.venv/bin/python || { echo "Eval Python environment missing. Run: just setup-eval"; exit 1; }
	@eval/.venv/bin/python -c "import cadquery" || { echo "Eval Python dependencies are not importable. Run inside nix develop if using Nix, then run: just setup-eval"; exit 1; }

# Format all TypeScript source + config files
fmt:
	npx prettier --write "src/**/*.ts" "eval/**/*.ts" eslint.config.js tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml" "occt/ts/eslint.config.js" "occt/ts/tsconfig.json" "occt/ts/package.json"

# Check formatting without writing
fmt-check:
	npx prettier --check "src/**/*.ts" "eval/**/*.ts" eslint.config.js tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml" "occt/ts/eslint.config.js" "occt/ts/tsconfig.json" "occt/ts/package.json"

# Remove generated artifacts and installed dependencies
clean:
	rm -rf dist node_modules occt/ts/node_modules occt/dist occt/build occt/ts/dist occt/*.tgz *.tgz eval/runs

# Verify no build artifacts or tarballs remain (for pre-PR check)
check-clean:
	@! test -d dist && echo "✅ dist/ clean" || { echo "❌ dist/ still exists"; exit 1; }
	@! test -f *.tgz && echo "✅ no root .tgz" || { echo "❌ root .tgz found"; exit 1; }
	@! test -f occt/*.tgz && echo "✅ no occt .tgz" || { echo "❌ occt .tgz found"; exit 1; }
	@! test -d eval/runs && echo "✅ eval/runs/ clean" || { echo "❌ eval/runs/ still exists"; exit 1; }
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
	cd occt/codegen && cargo fmt --check && cargo clippy -- -D warnings
