# Changelog

## [0.6.0](https://github.com/mattmohandiss/cad-mcp-server/compare/cad-mcp-server-v0.5.0...cad-mcp-server-v0.6.0) (2026-07-08)


### ⚠ BREAKING CHANGES

* redesign tool surface for LLM-friendly flat schemas ([#26](https://github.com/mattmohandiss/cad-mcp-server/issues/26))

### Features

* redesign tool surface for LLM-friendly flat schemas ([#26](https://github.com/mattmohandiss/cad-mcp-server/issues/26)) ([57c25f0](https://github.com/mattmohandiss/cad-mcp-server/commit/57c25f0add80b84aa65006d2a2f0c5750b4f0b7c))

## [0.5.0](https://github.com/mattmohandiss/cad-mcp-server/compare/cad-mcp-server-v0.4.4...cad-mcp-server-v0.5.0) (2026-07-07)


### Features

* add cylindrical face axis field to MCP tool surface ([7e3296f](https://github.com/mattmohandiss/cad-mcp-server/commit/7e3296f2b276b87531dabb54ceccfb328044dbc2))
* add draft_angle op, adjacency defaults, remove unimplemented ops ([728ffe6](https://github.com/mattmohandiss/cad-mcp-server/commit/728ffe6d39c52245b47c81abdf2459e171a70593))
* add draft_check, hole_classification, hole_type scenarios ([d5db859](https://github.com/mattmohandiss/cad-mcp-server/commit/d5db859c02548e9efc21cea16b81841f860d066e))
* add drill_directions and clearance_hole_to_edge reasoning scenarios ([74a68da](https://github.com/mattmohandiss/cad-mcp-server/commit/74a68da86a570de1ba1dd16bb9556c0531015242))
* **eval:** auto-load OPENROUTER_API_KEY from eval/.env ([7b39b7e](https://github.com/mattmohandiss/cad-mcp-server/commit/7b39b7e9f7d673fe30a47abc9c8f50d765ba7d85))
* **eval:** ground-truth STEP fixtures + NixOS cadquery setup ([0304d19](https://github.com/mattmohandiss/cad-mcp-server/commit/0304d1978d78ec541ea507bacacc18e0da2ea8c3))
* **eval:** OpenRouter multi-model runner + 5 questions with ground truth ([e5c12da](https://github.com/mattmohandiss/cad-mcp-server/commit/e5c12dab5dcc48f91a96474f0bff23e54961bba4))
* final tool surface — 9 tools with grid ray mode, draft angles, measure_distance ([ef6d3d6](https://github.com/mattmohandiss/cad-mcp-server/commit/ef6d3d670a7cb4e370d77cb9048f6e84c7360b17))
* introduce 4-tool surface with declarative query engine ([4e54710](https://github.com/mattmohandiss/cad-mcp-server/commit/4e5471061a8dd9f1535ea767a20bc6729f2b6e3d))
* restructure to deterministic surface — find_coaxial_cylinders + query_ray_intersect tools ([7f31a96](https://github.com/mattmohandiss/cad-mcp-server/commit/7f31a96c7fec9f8316d72700008ec407aad0274a))
* streamline eval scoring and geometry queries ([ef7721c](https://github.com/mattmohandiss/cad-mcp-server/commit/ef7721cdd34090805299cd8a71454c00afdf10b2))
* use OCCT-native IntCurvesFace_ShapeIntersector, gp_Ax1::IsCoaxial, Geom_Circle::Radius ([64d784e](https://github.com/mattmohandiss/cad-mcp-server/commit/64d784e4ce60bcdae9186ad7cb31ce2e87ebe101))
* wire measure dispatch, aggregate, and pipeline for_each/filter_results ([a38ee08](https://github.com/mattmohandiss/cad-mcp-server/commit/a38ee08c747dac8b1e2e3da0d48007689aebcee5))


### Bug Fixes

* add version sync validation between package.json and server.json ([e28d59f](https://github.com/mattmohandiss/cad-mcp-server/commit/e28d59f7a4a2b36b28a3e2ab5157828202ae3278))
* add WASM guards to integration tests that require OCCT kernel ([36eb590](https://github.com/mattmohandiss/cad-mcp-server/commit/36eb59070fcf6d5d8532e61359356ca3422ae9bb))
* build occt/ts types before root tsc in lint CI ([e203c37](https://github.com/mattmohandiss/cad-mcp-server/commit/e203c370f59eeaad9b2235c5c71c0717b810c42f))
* **ci:** pin rust toolchain to 1.95 to match occt/rust-toolchain.toml ([cd3eccb](https://github.com/mattmohandiss/cad-mcp-server/commit/cd3eccbf6089df95b7f691ce685aa9e1b1968a33))
* codegen now generates Embind bindings for Skip methods ([0b4e8f9](https://github.com/mattmohandiss/cad-mcp-server/commit/0b4e8f9c9f865eece8e31df35f317c3979c7953e))
* flatten measure_step schema and add thin_walls reasoning scenario ([4dfd0dd](https://github.com/mattmohandiss/cad-mcp-server/commit/4dfd0dd7335b932a04d20db83ee50ed07fd35ffe))
* handle exhausted-max-steps edge case in eval text parsing ([43a633a](https://github.com/mattmohandiss/cad-mcp-server/commit/43a633a55c5c541860dc139c410975ed714868a7))
* honor release-please server metadata updates ([#25](https://github.com/mattmohandiss/cad-mcp-server/issues/25)) ([992b4c4](https://github.com/mattmohandiss/cad-mcp-server/commit/992b4c4f25d8b5d1717d21125cbd83723dfa9681))
* include runtime package metadata ([#12](https://github.com/mattmohandiss/cad-mcp-server/issues/12)) ([c995940](https://github.com/mattmohandiss/cad-mcp-server/commit/c9959406e340aa8062642e78dee32d3192ae6905))
* install rustfmt + clippy components in CI ([5ad40d1](https://github.com/mattmohandiss/cad-mcp-server/commit/5ad40d16c1a78b05b9213d4bb1dbb91f40820f4d))
* PMI grouping uses shared groupEntities; add 26 query layer unit tests ([6625962](https://github.com/mattmohandiss/cad-mcp-server/commit/6625962764ee436b88f9ac15e286708abb80a8a2))
* prepare npm and MCP registry publishing ([#10](https://github.com/mattmohandiss/cad-mcp-server/issues/10)) ([64bfaee](https://github.com/mattmohandiss/cad-mcp-server/commit/64bfaee03bea9e1d40d7305febe86bdf9defc613))
* remove broken extra-files from release-please, auto-sync server.json in workflow ([46bf675](https://github.com/mattmohandiss/cad-mcp-server/commit/46bf675eea3005289152840fd168ad43677a6938))
* remove flaky diff test that blocks CI releases ([281f13a](https://github.com/mattmohandiss/cad-mcp-server/commit/281f13ab17ca74adc243fe20cf114db2aa0af94b))
* remove Output.object() to support all models agnostically ([10e3389](https://github.com/mattmohandiss/cad-mcp-server/commit/10e3389e9f31294ec5c0d30196cd81704daa4c2b))
* resolve pre-commit hook failure by scoping lint-staged to src/eval ([cf80893](https://github.com/mattmohandiss/cad-mcp-server/commit/cf8089395b8b73338e3734a7b11a30788b2d200c))
* sync server.json to ([d3df74c](https://github.com/mattmohandiss/cad-mcp-server/commit/d3df74c0dfb3e526c7b547fdf3b9c4eef094343d))
* sync server.json version to 0.4.0 for MCP Registry ([df9e726](https://github.com/mattmohandiss/cad-mcp-server/commit/df9e7264c2f3ce2c969dddafc56025f8f715711b))
* sync server.json version to 0.4.1 ([88c967c](https://github.com/mattmohandiss/cad-mcp-server/commit/88c967c433b437f25037dd2a4c445317ab25c1ea))
* tighten CI pipeline and fix stale config ([f8dad7f](https://github.com/mattmohandiss/cad-mcp-server/commit/f8dad7f6e71337f9b4ffc4d4145c58a4b2db63f0))
* trim server.json description to 100 char MCP Registry limit ([9cdb9dc](https://github.com/mattmohandiss/cad-mcp-server/commit/9cdb9dc2d4a3310843b572de3a6c1dfcd65388c6))
* update test assertions for 16 scenarios and 7 measure ops ([d984bf2](https://github.com/mattmohandiss/cad-mcp-server/commit/d984bf2e52053b9b21f05599f229d7cda32982bc))


### Performance

* trim MCP schema descriptions and strip raw ray-grid data ([d773524](https://github.com/mattmohandiss/cad-mcp-server/commit/d77352454e9a3ffb77de3e34573798476b421469))


### Miscellaneous

* 5-tool MCP surface with entity-specific schemas and source-driven eval ([a20b497](https://github.com/mattmohandiss/cad-mcp-server/commit/a20b497d4c8122dfa2fe53fad4b1d3674f3db715))
* eliminate adapter layer, remove heuristics, centralize versioning ([2baf18b](https://github.com/mattmohandiss/cad-mcp-server/commit/2baf18b573d72892e043fe63575658f6a287ec07))
* Phase 2 eval framework — structured traces and component checks ([dead82f](https://github.com/mattmohandiss/cad-mcp-server/commit/dead82f1ccd353299ea2380d67f0303db0816de9))
* source cleanup before occt-wasm fork integration ([3e1a57f](https://github.com/mattmohandiss/cad-mcp-server/commit/3e1a57f9572758ca47c6b96141b8cba5e948337d))

## [0.4.4](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.4.3...v0.4.4) (2026-07-01)


### Bug Fixes

* remove broken extra-files from release-please, auto-sync server.json in workflow ([46bf675](https://github.com/mattmohandiss/cad-mcp-server/commit/46bf675eea3005289152840fd168ad43677a6938))

## [0.4.3](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.4.2...v0.4.3) (2026-07-01)


### Bug Fixes

* sync server.json to ([d3df74c](https://github.com/mattmohandiss/cad-mcp-server/commit/d3df74c0dfb3e526c7b547fdf3b9c4eef094343d))

## [0.4.2](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.4.1...v0.4.2) (2026-07-01)


### Bug Fixes

* add version sync validation between package.json and server.json ([e28d59f](https://github.com/mattmohandiss/cad-mcp-server/commit/e28d59f7a4a2b36b28a3e2ab5157828202ae3278))
* sync server.json version to 0.4.0 for MCP Registry ([df9e726](https://github.com/mattmohandiss/cad-mcp-server/commit/df9e7264c2f3ce2c969dddafc56025f8f715711b))
* sync server.json version to 0.4.1 ([88c967c](https://github.com/mattmohandiss/cad-mcp-server/commit/88c967c433b437f25037dd2a4c445317ab25c1ea))
* trim server.json description to 100 char MCP Registry limit ([9cdb9dc](https://github.com/mattmohandiss/cad-mcp-server/commit/9cdb9dc2d4a3310843b572de3a6c1dfcd65388c6))

## [0.4.1](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.4.0...v0.4.1) (2026-07-01)


### Bug Fixes

* remove flaky diff test that blocks CI releases ([281f13a](https://github.com/mattmohandiss/cad-mcp-server/commit/281f13ab17ca74adc243fe20cf114db2aa0af94b))

## [0.4.0](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.3.3...v0.4.0) (2026-07-01)


### Features

* add draft_angle op, adjacency defaults, remove unimplemented ops ([728ffe6](https://github.com/mattmohandiss/cad-mcp-server/commit/728ffe6d39c52245b47c81abdf2459e171a70593))
* add draft_check, hole_classification, hole_type scenarios ([d5db859](https://github.com/mattmohandiss/cad-mcp-server/commit/d5db859c02548e9efc21cea16b81841f860d066e))
* add drill_directions and clearance_hole_to_edge reasoning scenarios ([74a68da](https://github.com/mattmohandiss/cad-mcp-server/commit/74a68da86a570de1ba1dd16bb9556c0531015242))


### Bug Fixes

* add WASM guards to integration tests that require OCCT kernel ([36eb590](https://github.com/mattmohandiss/cad-mcp-server/commit/36eb59070fcf6d5d8532e61359356ca3422ae9bb))
* flatten measure_step schema and add thin_walls reasoning scenario ([4dfd0dd](https://github.com/mattmohandiss/cad-mcp-server/commit/4dfd0dd7335b932a04d20db83ee50ed07fd35ffe))
* handle exhausted-max-steps edge case in eval text parsing ([43a633a](https://github.com/mattmohandiss/cad-mcp-server/commit/43a633a55c5c541860dc139c410975ed714868a7))
* remove Output.object() to support all models agnostically ([10e3389](https://github.com/mattmohandiss/cad-mcp-server/commit/10e3389e9f31294ec5c0d30196cd81704daa4c2b))
* update test assertions for 16 scenarios and 7 measure ops ([d984bf2](https://github.com/mattmohandiss/cad-mcp-server/commit/d984bf2e52053b9b21f05599f229d7cda32982bc))


### Performance Improvements

* trim MCP schema descriptions and strip raw ray-grid data ([d773524](https://github.com/mattmohandiss/cad-mcp-server/commit/d77352454e9a3ffb77de3e34573798476b421469))

## [0.3.3](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.3.2...v0.3.3) (2026-06-29)


### Bug Fixes

* tighten CI pipeline and fix stale config ([f8dad7f](https://github.com/mattmohandiss/cad-mcp-server/commit/f8dad7f6e71337f9b4ffc4d4145c58a4b2db63f0))

## [0.3.2](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.3.1...v0.3.2) (2026-06-29)


### Bug Fixes

* include runtime package metadata ([#12](https://github.com/mattmohandiss/cad-mcp-server/issues/12)) ([c995940](https://github.com/mattmohandiss/cad-mcp-server/commit/c9959406e340aa8062642e78dee32d3192ae6905))

## [0.3.1](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.3.0...v0.3.1) (2026-06-29)

### Bug Fixes

- prepare npm and MCP registry publishing ([#10](https://github.com/mattmohandiss/cad-mcp-server/issues/10)) ([64bfaee](https://github.com/mattmohandiss/cad-mcp-server/commit/64bfaee03bea9e1d40d7305febe86bdf9defc613))

## [0.3.0](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.2.0...v0.3.0) (2026-06-28)

### Features

- add cylindrical face axis field to MCP tool surface ([7e3296f](https://github.com/mattmohandiss/cad-mcp-server/commit/7e3296f2b276b87531dabb54ceccfb328044dbc2))
- **eval:** auto-load OPENROUTER_API_KEY from eval/.env ([7b39b7e](https://github.com/mattmohandiss/cad-mcp-server/commit/7b39b7e9f7d673fe30a47abc9c8f50d765ba7d85))
- **eval:** ground-truth STEP fixtures + NixOS cadquery setup ([0304d19](https://github.com/mattmohandiss/cad-mcp-server/commit/0304d1978d78ec541ea507bacacc18e0da2ea8c3))
- **eval:** OpenRouter multi-model runner + 5 questions with ground truth ([e5c12da](https://github.com/mattmohandiss/cad-mcp-server/commit/e5c12dab5dcc48f91a96474f0bff23e54961bba4))
- final tool surface — 9 tools with grid ray mode, draft angles, measure_distance ([ef6d3d6](https://github.com/mattmohandiss/cad-mcp-server/commit/ef6d3d670a7cb4e370d77cb9048f6e84c7360b17))
- introduce 4-tool surface with declarative query engine ([4e54710](https://github.com/mattmohandiss/cad-mcp-server/commit/4e5471061a8dd9f1535ea767a20bc6729f2b6e3d))
- restructure to deterministic surface — find_coaxial_cylinders + query_ray_intersect tools ([7f31a96](https://github.com/mattmohandiss/cad-mcp-server/commit/7f31a96c7fec9f8316d72700008ec407aad0274a))
- use OCCT-native IntCurvesFace_ShapeIntersector, gp_Ax1::IsCoaxial, Geom_Circle::Radius ([64d784e](https://github.com/mattmohandiss/cad-mcp-server/commit/64d784e4ce60bcdae9186ad7cb31ce2e87ebe101))
- wire measure dispatch, aggregate, and pipeline for_each/filter_results ([a38ee08](https://github.com/mattmohandiss/cad-mcp-server/commit/a38ee08c747dac8b1e2e3da0d48007689aebcee5))

### Bug Fixes

- build occt/ts types before root tsc in lint CI ([e203c37](https://github.com/mattmohandiss/cad-mcp-server/commit/e203c370f59eeaad9b2235c5c71c0717b810c42f))
- **ci:** pin rust toolchain to 1.95 to match occt/rust-toolchain.toml ([cd3eccb](https://github.com/mattmohandiss/cad-mcp-server/commit/cd3eccbf6089df95b7f691ce685aa9e1b1968a33))
- codegen now generates Embind bindings for Skip methods ([0b4e8f9](https://github.com/mattmohandiss/cad-mcp-server/commit/0b4e8f9c9f865eece8e31df35f317c3979c7953e))
- install rustfmt + clippy components in CI ([5ad40d1](https://github.com/mattmohandiss/cad-mcp-server/commit/5ad40d16c1a78b05b9213d4bb1dbb91f40820f4d))
- PMI grouping uses shared groupEntities; add 26 query layer unit tests ([6625962](https://github.com/mattmohandiss/cad-mcp-server/commit/6625962764ee436b88f9ac15e286708abb80a8a2))

## [0.2.0](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.1.1...v0.2.0) (2026-06-28)

### Features

- **eval:** auto-load OPENROUTER_API_KEY from eval/.env ([7b39b7e](https://github.com/mattmohandiss/cad-mcp-server/commit/7b39b7e9f7d673fe30a47abc9c8f50d765ba7d85))
- **eval:** ground-truth STEP fixtures + NixOS cadquery setup ([0304d19](https://github.com/mattmohandiss/cad-mcp-server/commit/0304d1978d78ec541ea507bacacc18e0da2ea8c3))
- **eval:** OpenRouter multi-model runner + 5 questions with ground truth ([e5c12da](https://github.com/mattmohandiss/cad-mcp-server/commit/e5c12dab5dcc48f91a96474f0bff23e54961bba4))
- final tool surface — 9 tools with grid ray mode, draft angles, measure_distance ([ef6d3d6](https://github.com/mattmohandiss/cad-mcp-server/commit/ef6d3d670a7cb4e370d77cb9048f6e84c7360b17))
- introduce 4-tool surface with declarative query engine ([4e54710](https://github.com/mattmohandiss/cad-mcp-server/commit/4e5471061a8dd9f1535ea767a20bc6729f2b6e3d))
- restructure to deterministic surface — find_coaxial_cylinders + query_ray_intersect tools ([7f31a96](https://github.com/mattmohandiss/cad-mcp-server/commit/7f31a96c7fec9f8316d72700008ec407aad0274a))
- use OCCT-native IntCurvesFace_ShapeIntersector, gp_Ax1::IsCoaxial, Geom_Circle::Radius ([64d784e](https://github.com/mattmohandiss/cad-mcp-server/commit/64d784e4ce60bcdae9186ad7cb31ce2e87ebe101))
- wire measure dispatch, aggregate, and pipeline for_each/filter_results ([a38ee08](https://github.com/mattmohandiss/cad-mcp-server/commit/a38ee08c747dac8b1e2e3da0d48007689aebcee5))

### Bug Fixes

- build occt/ts types before root tsc in lint CI ([e203c37](https://github.com/mattmohandiss/cad-mcp-server/commit/e203c370f59eeaad9b2235c5c71c0717b810c42f))
- **ci:** pin rust toolchain to 1.95 to match occt/rust-toolchain.toml ([cd3eccb](https://github.com/mattmohandiss/cad-mcp-server/commit/cd3eccbf6089df95b7f691ce685aa9e1b1968a33))
- codegen now generates Embind bindings for Skip methods ([0b4e8f9](https://github.com/mattmohandiss/cad-mcp-server/commit/0b4e8f9c9f865eece8e31df35f317c3979c7953e))
- install rustfmt + clippy components in CI ([5ad40d1](https://github.com/mattmohandiss/cad-mcp-server/commit/5ad40d16c1a78b05b9213d4bb1dbb91f40820f4d))
- PMI grouping uses shared groupEntities; add 26 query layer unit tests ([6625962](https://github.com/mattmohandiss/cad-mcp-server/commit/6625962764ee436b88f9ac15e286708abb80a8a2))
