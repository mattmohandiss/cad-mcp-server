default:
	just --list

# Initialize submodules after clone
init:
	git submodule update --init --recursive

# Full setup: submodules + npm deps
setup: init
	npm install

# Rebuild occt-wasm fork via Docker (requires running Docker daemon)
rebuild-wasm:
	cd vendor/occt-wasm && docker build --progress=plain -t occt-wasm . && docker run --rm -v "$$(pwd)/dist:/out" occt-wasm sh -c 'cp dist/* /out/'
	cd vendor/occt-wasm/ts && bash scripts/copy-wasm.sh
	cd vendor/occt-wasm/ts && npm install && npm run build

dev:
	npm run build && node dist/index.js

watch:
	npm run watch

test:
	npm test

fmt:
	npm run fmt

lint:
	npm run lint

check: fmt lint test
	@echo "Check completed"

build:
	npm run build

# Regenerate C++ facade from codegen config
codegen:
	cd vendor/occt-wasm && cargo run -- codegen

clean:
	rm -rf dist node_modules
