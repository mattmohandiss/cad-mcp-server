# Geometry MCP Contributor Instructions

- Keep the public surface focused on `inspect`, `find_entities`, `measure`, and
  `diff`. Return measured facts, not manufacturing approval or design intent.
- Preserve read-only STEP handling, strict schemas, revision checks, and explicit
  entity ID schemes. Do not add arbitrary kernel/code execution.
- Use strict TypeScript, ESM imports with `.js` extensions, single quotes, and
  existing Prettier/oxlint conventions.
- Prefer `just` recipes. Run `just check` for source changes; use `just ci` and
  configured native tests for sidecar-sensitive changes.
- Keep tests, fixtures, build inputs, and required documentation server-local.
- Use conventional commits; do not manually bump release-managed versions,
  edit generated changelog history, or publish outside the release workflow.
- Native build outputs are generated artifacts; do not commit them.

See [development](docs/DEVELOPMENT.md) for commands, packaging, and release details.
