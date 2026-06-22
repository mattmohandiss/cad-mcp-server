{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self
    , nixpkgs
    , flake-utils
    ,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          # Project-specific dependencies: runtimes, linters, formatters,
          # test tools, and build tools.
          # Global Neovim provides editor behavior, not language tool choices.
          buildInputs = with pkgs; [
            just
            nodejs_24
            podman

            # Rust toolchain (codegen + crate linting)
            cargo
            rustc

            # C++ formatting
            clang-tools
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
