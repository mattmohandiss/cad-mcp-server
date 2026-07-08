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

        # Libraries that cadquery-ocp (the OCP/wheel) links against and
        # that NixOS Python can't find via its store rpath. The dev shell
        # exports these so the repo-local eval venv can import cadquery.
        cqLibraries = with pkgs; [
          stdenv.cc.cc.lib
          libGL
          libGLU
          libx11
          libxext
          freetype
          fontconfig
          libpng
          zlib
          libxml2
          expat
          openssl
          bzip2
          xz
          gmp
          readline
          sqlite
        ];

        cqLibraryPath = pkgs.lib.makeLibraryPath cqLibraries;

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            just
            nodejs_24
            podman

            # Rust toolchain (codegen + crate linting)
            cargo
            rustc
            rustfmt
            clippy

            # C++ formatting
            clang-tools

            # Python for OCCT-backed LLM eval STEP generation.
            # pip-installed via just setup-eval into eval/.venv.
            python3
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            export LD_LIBRARY_PATH="${cqLibraryPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
          '';
        };
      }
    );
}
