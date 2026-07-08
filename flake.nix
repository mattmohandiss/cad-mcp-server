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
        # that NixOS Python can't find via its store rpath. The wrapper
        # below adds these to LD_LIBRARY_PATH so cadquery can import.
        cqLibraries = with pkgs; [
          stdenv.cc.cc.lib
          libGL
          libGLU
          xorg.libX11
          xorg.libXext
          freetype
          fontconfig
          libpng
          zlib
          libxml2
          openssl
          bzip2
          xz
          gmp
          readline
          sqlite
        ];

        cqLibraryPath = pkgs.lib.makeLibraryPath cqLibraries;

        # Wraps python so pip-installed cadquery can find its native
        # OCCT deps on NixOS where standard library paths don't exist.
        pythonWrapper = pkgs.writeShellScriptBin "python" ''
          export LD_LIBRARY_PATH="${cqLibraryPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
          exec -a "$0" ${pkgs.python3}/bin/python "$@"
        '';
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
            # pip-installed via just setup-eval into eval/generate/.venv.
            pythonWrapper
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
