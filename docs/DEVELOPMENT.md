# Geometry Server Development

## Environment and commands

Requires Node.js 24+ and npm. Native sidecar builds also need Python 3, CMake,
Ninja, and a C++ compiler. A Nix flake provides the toolchain: `.envrc` runs
`use flake` (run `direnv allow` after changes), `nix develop` is the full shell,
and `nix develop .#checks` is the lightweight shell without the native toolchain.

```sh
git clone https://github.com/mattmohandiss/cad-mcp-server.git
cd cad-mcp-server
just setup
just check
just build
```

`just dev` runs the TypeScript stdio server; it does not compile the sidecar.
For local native geometry calls:

```sh
just sidecar-native
CAD_MCP_SIDECAR=occt/sidecar/build-work/native/occt-sidecar just dev
```

| Recipe                                 | Purpose                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `setup`                                | Install npm dependencies.                                       |
| `dev`                                  | Run the TypeScript stdio server (no sidecar compile).           |
| `build`                                | Compile TypeScript into `dist/`.                                |
| `test`                                 | Run unit tests (native integration tests are excluded).         |
| `test-integration`                     | Run native sidecar integration tests (needs `CAD_MCP_SIDECAR`). |
| `lint`                                 | Oxlint.                                                         |
| `typecheck`                            | TypeScript checking (`tsc --noEmit`).                           |
| `fmt` / `fmt-check`                    | Rewrite / verify Prettier formatting.                           |
| `check`                                | Formatting, lint, typecheck, and tests.                         |
| `ci`                                   | Full check: lint/format, native sidecar build, and all tests.   |
| `sidecar-native` / `sidecar-native-ci` | Native OCCT build variants.                                     |
| `clean` / `check-clean`                | Remove generated artifacts / check cleanup.                     |

Direct equivalents include `npm test`, `npm run build`, `npm run lint`, and
`npm run typecheck`. Check `just --list` for the current recipe surface.

Server logs are newline-delimited pino JSON on stderr. `MCP_LOG_LEVEL`
(`debug`|`info`|`warn`|`error`), `MCP_LOG_FORMAT=human`, and `MCP_TRACE_ID` tune
them; secret-like fields are redacted.

Native integration tests use `CAD_MCP_SIDECAR`. `CAD_MCP_SIDECAR_LAUNCHER`
optionally specifies an APE launcher, and the measurement test supports
`CAD_MCP_TEST_STEP`. Supply a compatible fixture when overriding the default.

## Source and native build layout

- `src/tools/`: public tool implementations.
- `src/domain/`: artifact/subject references.
- `src/sidecar/`: sidecar protocol and model lifecycle.
- `tests/`: server-owned correctness and native integration checks.
- `occt/sidecar/`: C++ source and native/Cosmopolitan build scripts.

The optional viewer artifact API is enabled with `--viewer-api=http` when
launching the server. It is not needed for ordinary MCP calls.

`occt/sidecar/scripts/build.py` uses pinned OCCT 8.0.1 and Cosmopolitan inputs.
`package_cosmopolitan_payload.py` assembles a cacheable payload; macOS ARM uses
a separately built launcher. Payload cache keys include sidecar source and
packaging scripts, with ccache as a fallback. Build output directories are generated.

## CI and releases

PR CI runs local checks, registry metadata validation, dependency review, native
payload/launcher builds, and server packaging. It does not currently run a
cross-platform public MCP smoke matrix. Native tests without their required
environment are skipped, so a passing fast check alone is not native validation.

Release-please and npm trusted publishing automate releases:

1. Main-branch workflows restore/build the trusted payload cache and maintain
   the release PR.
2. Conventional commits determine version changes (`feat`, `fix`, and breaking
   change markers). Do not manually edit release-managed versions or changelog.
3. Merging the release PR creates the release/tag before publication completes.
4. Publication assembles the sidecar and launchers, packs the tarball, checks
   existing npm integrity on retries, and publishes to npm and the MCP Registry.
   Failed downstream jobs can be rerun after correcting their cause.

Npm authentication uses OIDC trusted publishing configured for
`.github/workflows/release-please.yml`. `RELEASE_PLEASE_TOKEN` is a repository
secret used to create release PRs that trigger CI. Never commit token values.
Dependabot maintains npm and GitHub Actions dependency updates.

The runtime target matrix, shared with Simulation MCP, is Windows x64,
macOS ARM64 (Apple Silicon), and Linux x64. Intel macOS, Linux ARM64, and
Windows ARM64 are outside the distribution targets. Keep supported-platform
claims distinct from the coverage actually executed.

## Distribution

The npm package contains compiled runtime code, sidecar binaries/launchers,
metadata, README, example prompts, and third-party notices. Exclude tests,
source maps, and development artifacts. Preview the actual package with
`npm pack --dry-run --ignore-scripts` before changing package contents.

See [architecture](ARCHITECTURE.md), [security](SECURITY.md), and
[third-party notices](../THIRD_PARTY_NOTICES.md) for domain and distribution context.
