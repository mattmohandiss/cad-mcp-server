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

# Native sidecar integration tests (require a configured CAD_MCP_SIDECAR).
test-integration:
	npm run test:integration

typecheck:
	npm run typecheck

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

check: fmt-check lint typecheck test

# Full Linux local path: compile the native OCCT sidecar and run all checks.
ci: fmt-check lint typecheck sidecar-native-ci test test-integration

sidecar-native:
	python3 occt/sidecar/scripts/build.py native --jobs 8 --work occt/sidecar/build-work

sidecar-native-ci:
	python3 occt/sidecar/scripts/build.py native --jobs 2 --work occt/sidecar/build-work

clean:
	rm -rf dist node_modules occt/sidecar/build occt/sidecar/build-work *.tgz

check-clean:
	@test ! -d dist && test ! -f *.tgz
