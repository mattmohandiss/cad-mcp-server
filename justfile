default:
	just --list

setup:
	npm install

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

clean:
	rm -rf dist node_modules
