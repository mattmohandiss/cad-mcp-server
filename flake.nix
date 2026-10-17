{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/331800de5053fcebacf6813adb5db9c9dca22a0c";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      eachSystem = nixpkgs.lib.genAttrs systems;

      # Libraries used by CadQuery/OCP development tooling that NixOS Python
      # cannot find through the wheel's store rpath.
      cqLibraries =
        pkgs:
        with pkgs;
        [
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
    in
    {
      devShells = eachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          cqLibraryPath = pkgs.lib.makeLibraryPath (cqLibraries pkgs);
        in
        {
          # Fast checks: Node and just only, no native toolchain.
          checks = pkgs.mkShell {
            packages = with pkgs; [
              just
              nodejs_24
            ];
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
            '';
          };

          # Full shell: adds the OCCT sidecar build toolchain.
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              just
              nodejs_24
              cmake
              ninja
              ccache
              clang-tools
              python3
            ];
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              export LD_LIBRARY_PATH="${cqLibraryPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            '';
          };
        }
      );
    };
}
