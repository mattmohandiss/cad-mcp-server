# TODO

- Add optional release-only `wasm-opt`/Binaryen step for packaged builds.
  - Keep local `just build-wasm-dist` fast by default.
  - Enable optimization only for publish/release builds where smaller download size matters more than rebuild time.
- Consider a separate `just build-wasm-release` recipe for optimized wasm artifacts.
