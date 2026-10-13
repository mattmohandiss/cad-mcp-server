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

# Full Linux local path: compile the native OCCT sidecar and run server checks.
ci: fmt-check lint sidecar-native-ci test

fmt:
  npx prettier --write "src/**/*.ts" "scripts/**/*.mjs" .oxlintrc.json tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml"

fmt-check:
  npx prettier --check "src/**/*.ts" "scripts/**/*.mjs" .oxlintrc.json tsconfig.json vitest.config.ts package.json package-lock.json release-please-config.json server.json "*.md" "docs/**/*.md" ".github/**/*.yml"

sidecar-native:
	python3 occt/sidecar/scripts/build.py native --jobs 8 --work occt/sidecar/build-work

sidecar-native-ci:
	python3 occt/sidecar/scripts/build.py native --jobs 2 --work occt/sidecar/build-work

clean:
	rm -rf dist node_modules occt/sidecar/build occt/sidecar/build-work *.tgz

check-clean:
	@test ! -d dist && test ! -f *.tgz
