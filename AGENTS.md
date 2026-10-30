# Geometry MCP Server — contributor instructions

- Keep the public surface focused on `inspect`, `find_entities`, `measure`,
  `describe_pmi`, and `diff`. Return measured facts, not manufacturing approval or
  design intent.
- Preserve read-only STEP handling, strict schemas, revision checks, and explicit
  entity ID schemes. Do not add arbitrary kernel or code execution.
- Advertised tool schemas must be self-contained: inline `$defs`, no external
  `$ref` that a client would have to dereference.
- Keep tests, fixtures, build inputs, and required documentation in this
  repository. Native build outputs are generated artifacts; do not commit them.
- Use strict TypeScript, ESM imports with `.js` extensions, single quotes, and the
  existing Prettier/oxlint conventions.
- Prefer the `just` recipes. Run `just check` for source changes; use `just ci` and
  the configured native tests for sidecar-sensitive changes.
- `.envrc` activates the flake; run `direnv allow` after changing it. Server logs
  go to stderr as pino JSON; `MCP_LOG_LEVEL` and `MCP_LOG_FORMAT` tune them.
- Use conventional commits; do not hand-edit release-managed versions or generated
  changelog history, and publish only through the release workflow.

See [development](docs/DEVELOPMENT.md) for commands, packaging, and release
details.
