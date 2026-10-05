default:
	just --list

setup:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint
	npx tsc --noEmit

check: fmt-check lint test

# Full Linux CI path: compile the native OCCT sidecar and run all integration tests.
ci: fmt-check lint sidecar-native-ci
	CAD_MCP_SIDECAR=occt/sidecar/build-work/native/occt-sidecar \
	CAD_MCP_TEST_STEP=src/tests/fixtures/repeated-instances.step npm test

fmt:
	npx prettier --write "src/**/*.ts" "eval/**/*.ts" "scripts/**/*.mjs" .oxlintrc.json tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml"

fmt-check:
	npx prettier --check "src/**/*.ts" "eval/**/*.ts" "scripts/**/*.mjs" .oxlintrc.json tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml"

sidecar-native:
	python3 occt/sidecar/scripts/build.py native --jobs 8 --work occt/sidecar/build-work

sidecar-native-ci:
	python3 occt/sidecar/scripts/build.py native --jobs 2 --work occt/sidecar/build-work

clean:
	rm -rf dist node_modules occt/sidecar/build occt/sidecar/build-work *.tgz eval/runs

check-clean:
	@test ! -d dist && test ! -f *.tgz && test ! -d eval/runs

eval: _ensure-eval-env
	npx tsx eval/runner/index.ts

setup-eval:
	python3 -m venv eval/.venv && eval/.venv/bin/pip install -r eval/requirements.txt

_ensure-eval-env:
	@test -x eval/.venv/bin/python || { echo "Eval Python environment missing. Run: just setup-eval"; exit 1; }
	@eval/.venv/bin/python -c "import cadquery" || { echo "Eval Python dependencies are not importable. Run inside nix develop if using Nix, then run: just setup-eval"; exit 1; }
