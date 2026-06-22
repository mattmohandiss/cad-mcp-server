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
	cd kernel && docker build --progress=plain -t occt-wasm . && docker run --rm -v "$$(pwd)/dist:/out" occt-wasm sh -c 'cp dist/* /out/'
	cd kernel/ts && bash scripts/copy-wasm.sh
	cd kernel/ts && npm install && npm run build

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
	cd kernel && cargo run -- codegen

clean:
	rm -rf dist node_modules
