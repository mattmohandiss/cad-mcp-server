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

# The fixtures are regenerated first: they are build products, not sources.
[doc('Run the native sidecar tests (needs CAD_MCP_SIDECAR)')]
test-integration: fixture
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

# Fixtures are generated, not stored: the shapes live in
# occt/sidecar/tests/generate_fixtures.cpp, built by the same native target as the sidecar, so a
# fixture cannot drift from the test that asserts about it and cannot become an orphan. The
# nist_ctc_* files are deliberately not generated — they carry a real exporter's semantic,
# graphical, and tessellated PMI, and testing our reader against our own writer would prove
# nothing; they are fetched by hand, with their hashes in tests/fixtures/README.md.
[doc('Regenerate every synthetic fixture')]
fixture: sidecar-native
	./occt/sidecar/build-work/native/generate-fixtures tests/fixtures

sidecar-native-ci:
	python3 occt/sidecar/scripts/build.py native --jobs 2 --work occt/sidecar/build-work

# Cosmopolitan (APE) sidecar: the artefact that ships.
# Cold ~90 min on 8 cores; once `build-work/cosmo` exists it is incremental — a
# sidecar.cpp change is one compile and one link. Run this before believing an
# integration failure: those tests load this payload, not `build-work/native`, so a
# stale payload makes correct source look broken.
sidecar-cosmo:
	python3 occt/sidecar/scripts/build.py cosmo --jobs {{ num_cpus() }} --work occt/sidecar/build-work

# Package the payload and install it where .env and the harness expect it.
sidecar-payload:
	python3 occt/sidecar/scripts/package_cosmopolitan_payload.py --work occt/sidecar/build-work --output occt/sidecar/build-work/cosmo-payload.tar.gz
	mkdir -p occt/sidecar/build-work/remote/sidecar
	tar -xzf occt/sidecar/build-work/cosmo-payload.tar.gz -C occt/sidecar/build-work/remote/sidecar
	@echo "installed: occt/sidecar/build-work/remote/sidecar/bin/occt-sidecar.exe"

clean:
	rm -rf dist node_modules occt/sidecar/build occt/sidecar/build-work *.tgz

check-clean:
	@test ! -d dist && test ! -f *.tgz
