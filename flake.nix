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

        # A python wrapper that prepends the cadquery-needed libraries
        # to LD_LIBRARY_PATH. Uses `exec -a "$0"` so venv's shebang
        # (which execs python) still works.
        pythonWrapper = pkgs.writeShellScriptBin "python" ''
          export LD_LIBRARY_PATH="${cqLibraryPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
          exec -a "$0" ${pkgs.python3}/bin/python "$@"
        '';

        python3WithPip = pkgs.python3.withPackages (ps: [ps.pip ps.virtualenv]);
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

            # Python for the LLM eval (cadquery STEP generation).
            # Use the `python` wrapper so cadquery-ocp can find its
            # native deps. `python3` is also on PATH for direct use.
            python3WithPip
            pythonWrapper
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
