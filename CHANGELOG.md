# Changelog

## [0.3.0](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.2.0...v0.3.0) (2026-06-28)


### Features

* add cylindrical face axis field to MCP tool surface ([7e3296f](https://github.com/mattmohandiss/cad-mcp-server/commit/7e3296f2b276b87531dabb54ceccfb328044dbc2))
* **eval:** auto-load OPENROUTER_API_KEY from eval/.env ([7b39b7e](https://github.com/mattmohandiss/cad-mcp-server/commit/7b39b7e9f7d673fe30a47abc9c8f50d765ba7d85))
* **eval:** ground-truth STEP fixtures + NixOS cadquery setup ([0304d19](https://github.com/mattmohandiss/cad-mcp-server/commit/0304d1978d78ec541ea507bacacc18e0da2ea8c3))
* **eval:** OpenRouter multi-model runner + 5 questions with ground truth ([e5c12da](https://github.com/mattmohandiss/cad-mcp-server/commit/e5c12dab5dcc48f91a96474f0bff23e54961bba4))
* final tool surface — 9 tools with grid ray mode, draft angles, measure_distance ([ef6d3d6](https://github.com/mattmohandiss/cad-mcp-server/commit/ef6d3d670a7cb4e370d77cb9048f6e84c7360b17))
* introduce 4-tool surface with declarative query engine ([4e54710](https://github.com/mattmohandiss/cad-mcp-server/commit/4e5471061a8dd9f1535ea767a20bc6729f2b6e3d))
* restructure to deterministic surface — find_coaxial_cylinders + query_ray_intersect tools ([7f31a96](https://github.com/mattmohandiss/cad-mcp-server/commit/7f31a96c7fec9f8316d72700008ec407aad0274a))
* use OCCT-native IntCurvesFace_ShapeIntersector, gp_Ax1::IsCoaxial, Geom_Circle::Radius ([64d784e](https://github.com/mattmohandiss/cad-mcp-server/commit/64d784e4ce60bcdae9186ad7cb31ce2e87ebe101))
* wire measure dispatch, aggregate, and pipeline for_each/filter_results ([a38ee08](https://github.com/mattmohandiss/cad-mcp-server/commit/a38ee08c747dac8b1e2e3da0d48007689aebcee5))


### Bug Fixes

* build occt/ts types before root tsc in lint CI ([e203c37](https://github.com/mattmohandiss/cad-mcp-server/commit/e203c370f59eeaad9b2235c5c71c0717b810c42f))
* **ci:** pin rust toolchain to 1.95 to match occt/rust-toolchain.toml ([cd3eccb](https://github.com/mattmohandiss/cad-mcp-server/commit/cd3eccbf6089df95b7f691ce685aa9e1b1968a33))
* codegen now generates Embind bindings for Skip methods ([0b4e8f9](https://github.com/mattmohandiss/cad-mcp-server/commit/0b4e8f9c9f865eece8e31df35f317c3979c7953e))
* install rustfmt + clippy components in CI ([5ad40d1](https://github.com/mattmohandiss/cad-mcp-server/commit/5ad40d16c1a78b05b9213d4bb1dbb91f40820f4d))
* PMI grouping uses shared groupEntities; add 26 query layer unit tests ([6625962](https://github.com/mattmohandiss/cad-mcp-server/commit/6625962764ee436b88f9ac15e286708abb80a8a2))

## [0.2.0](https://github.com/mattmohandiss/cad-mcp-server/compare/v0.1.1...v0.2.0) (2026-06-28)


### Features

* **eval:** auto-load OPENROUTER_API_KEY from eval/.env ([7b39b7e](https://github.com/mattmohandiss/cad-mcp-server/commit/7b39b7e9f7d673fe30a47abc9c8f50d765ba7d85))
* **eval:** ground-truth STEP fixtures + NixOS cadquery setup ([0304d19](https://github.com/mattmohandiss/cad-mcp-server/commit/0304d1978d78ec541ea507bacacc18e0da2ea8c3))
* **eval:** OpenRouter multi-model runner + 5 questions with ground truth ([e5c12da](https://github.com/mattmohandiss/cad-mcp-server/commit/e5c12dab5dcc48f91a96474f0bff23e54961bba4))
* final tool surface — 9 tools with grid ray mode, draft angles, measure_distance ([ef6d3d6](https://github.com/mattmohandiss/cad-mcp-server/commit/ef6d3d670a7cb4e370d77cb9048f6e84c7360b17))
* introduce 4-tool surface with declarative query engine ([4e54710](https://github.com/mattmohandiss/cad-mcp-server/commit/4e5471061a8dd9f1535ea767a20bc6729f2b6e3d))
* restructure to deterministic surface — find_coaxial_cylinders + query_ray_intersect tools ([7f31a96](https://github.com/mattmohandiss/cad-mcp-server/commit/7f31a96c7fec9f8316d72700008ec407aad0274a))
* use OCCT-native IntCurvesFace_ShapeIntersector, gp_Ax1::IsCoaxial, Geom_Circle::Radius ([64d784e](https://github.com/mattmohandiss/cad-mcp-server/commit/64d784e4ce60bcdae9186ad7cb31ce2e87ebe101))
* wire measure dispatch, aggregate, and pipeline for_each/filter_results ([a38ee08](https://github.com/mattmohandiss/cad-mcp-server/commit/a38ee08c747dac8b1e2e3da0d48007689aebcee5))


### Bug Fixes

* build occt/ts types before root tsc in lint CI ([e203c37](https://github.com/mattmohandiss/cad-mcp-server/commit/e203c370f59eeaad9b2235c5c71c0717b810c42f))
* **ci:** pin rust toolchain to 1.95 to match occt/rust-toolchain.toml ([cd3eccb](https://github.com/mattmohandiss/cad-mcp-server/commit/cd3eccbf6089df95b7f691ce685aa9e1b1968a33))
* codegen now generates Embind bindings for Skip methods ([0b4e8f9](https://github.com/mattmohandiss/cad-mcp-server/commit/0b4e8f9c9f865eece8e31df35f317c3979c7953e))
* install rustfmt + clippy components in CI ([5ad40d1](https://github.com/mattmohandiss/cad-mcp-server/commit/5ad40d16c1a78b05b9213d4bb1dbb91f40820f4d))
* PMI grouping uses shared groupEntities; add 26 query layer unit tests ([6625962](https://github.com/mattmohandiss/cad-mcp-server/commit/6625962764ee436b88f9ac15e286708abb80a8a2))
