-- Project-local Neovim wiring. Tool versions come from this project's flake
-- and package.json; this file only connects those tools to editor features.

vim.lsp.enable({ "ts_ls" })

require("conform").formatters_by_ft.javascript = { "prettier" }
require("conform").formatters_by_ft.javascriptreact = { "prettier" }
require("conform").formatters_by_ft.json = { "prettier" }
require("conform").formatters_by_ft.jsonc = { "prettier" }
require("conform").formatters_by_ft.markdown = { "prettier" }
require("conform").formatters_by_ft.typescript = { "prettier" }
require("conform").formatters_by_ft.typescriptreact = { "prettier" }

require("lint").linters_by_ft.javascript = { "eslint" }
require("lint").linters_by_ft.javascriptreact = { "eslint" }
require("lint").linters_by_ft.typescript = { "eslint" }
require("lint").linters_by_ft.typescriptreact = { "eslint" }
