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
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-darwin" ] (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Libraries used by CadQuery/OCP development tooling that NixOS Python
        # cannot find through the wheel's store rpath.
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
            cmake
            ninja
            ccache

            # C++ formatting
            clang-tools

            # Python 3 for sidecar build and packaging tools.
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
