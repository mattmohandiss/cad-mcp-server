# Contributing

Thanks for your interest in CAD MCP Server. The project is MIT licensed; by
contributing you agree to the terms below.

## Development

Source setup, checks, packaging, and releases are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). The short version:

```sh
just setup
just check             # fmt-check, lint, typecheck, tests
just test-integration  # native sidecar tests
```

## Before you open a pull request

- Run `just check`, and `just test-integration` for sidecar-sensitive changes.
- Keep a change focused: one topic per pull request.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Add or update tests and documentation for behaviour changes.

## Sign-off (Developer Certificate of Origin)

Every commit must be signed off, certifying you have the right to submit it under
this project's license:

```sh
git commit -s -m "feat: ..."
```

This appends a `Signed-off-by:` line. The full text is at
<https://developercertificate.org>.

## License grant

By submitting a contribution, you license it to the project under the MIT License
and grant Matt Mohandiss a perpetual, worldwide, non-exclusive, royalty-free,
irrevocable, sublicensable license to use, reproduce, modify, distribute, and
relicense your contribution, including under different terms. You retain
copyright to your contribution.
