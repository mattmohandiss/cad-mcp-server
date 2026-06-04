# Project Agent Notes

## Local Scope
- This repo follows the user's global OpenCode guidance.
- This file only defines project-level conventions.

## Command Surface
- Prefer `just` as the command interface for setup, dev, test, lint, fmt, check, and build.

## Editor Tooling
- Project flakes and `package.json` own language servers, formatters, linters, runtimes, and test tools.
- Project `.nvim.lua` maps those tools to Neovim integrations.
- Do not add this project's language-tool choices to the global Neovim config.

## Delivery Expectations
- Implement the smallest viable change first.
- Validate with the most relevant `just` command(s).
- Report assumptions and deferred follow-ups clearly.
