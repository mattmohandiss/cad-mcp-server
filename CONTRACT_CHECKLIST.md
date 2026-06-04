# Project Contract Checklist

Use this checklist when creating or reviewing a repo.

## Required
- [ ] `.envrc` exists and loads flake (`use flake` or approved shared target)
- [ ] `flake.nix` defines `devShells.default`
- [ ] `justfile` includes canonical targets:
  - [ ] `default`
  - [ ] `setup`
  - [ ] `dev`
  - [ ] `fmt`
  - [ ] `lint`
  - [ ] `test`
  - [ ] `check`
  - [ ] `build`
  - [ ] `clean`
- [ ] `.gitignore` covers local env and shell artifacts
- [ ] `AGENTS.md` exists and is non-empty

## Consistency
- [ ] README command examples match real `justfile` targets
- [ ] Project `opencode.json` is additive (no duplicated global policy text)
- [ ] Project `.nvim.lua` contains repo-specific behavior only

## Optional but Recommended
- [ ] `flake.lock` committed for reproducible tool versions
- [ ] Language-specific tool config files are present (`pyproject.toml`, `analysis_options.yaml`, `eslint.config.*`, etc.)
