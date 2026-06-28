# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-28

### Added

- New 4-tool declarative surface: `inspect_step`, `query_step`, `diff_step`, `transact_step`. The seven v0.1 primitives (face/edge search, entity lookup, PMI query, ray test, distance, coaxial grouping) are now expressible as `query_step` calls.
- LLM eval system: OpenRouter-backed runner, 5 ground-truth questions across 3 models (Claude Sonnet 4.5, GPT-4o-mini, Gemini 2.5 Flash). Run locally with `just eval`.
- `just build-wasm` recipe for building the OCCT kernel via Docker.
- `just ci` recipe that mirrors the full CI pipeline locally.
- Pre-push git hook (`just check`) so broken code can't leave your machine.
- Branch protection on `main` via a GitHub ruleset: requires PR, status check, no force-push.

### Changed

- Eval no longer runs as part of `npm test` (real LLM API calls, costs money). Use `just eval` explicitly.
- CI workflow restructured: `lint + npm test` on every PR; full WASM build + kernel tests only on `push to main`, `v*` tag, or release PR. Uses `docker/build-push-action@v7` with GHA Docker layer cache.
- `eval/runner/runner.ts` reads `OPENROUTER_API_KEY` defensively (process.env first, falls back to `eval/.env`).
- `rustfmt` and `clippy` components installed in CI; toolchain pinned to 1.95 to match `occt/rust-toolchain.toml`.
- README and `docs/ARCHITECTURE.md` updated to reflect the 4-tool surface and the `server measures, LLM decides` design principle.

### Removed

- 9 specialized v0.1 tools (`find_step_faces`, `find_step_edges`, `get_step_entities`, `query_step_pmi`, `query_ray_intersect`, `measure_distance`, `find_coaxial_cylinders`, `compare_step_files`, `inspect_step_file`) — all consolidated into the declarative surface.
- 36 unused NIST sample files (~55MB) from `samples/`.
- TODO.md, test_prompts.md (personal planning files, not for public repo).

## [0.1.1] - 2026-XX-XX

Initial public release. 9-tool surface for STEP inspection, `occt-wasm` kernel bundled, MIT licensed.
