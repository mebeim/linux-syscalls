{
  description = "Browsable linux kernel syscall tables static website generator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = {
          default = pkgs.stdenv.mkDerivation {
            name = "linux-syscalls";
            src = ./.;
            nativeBuildInputs = with pkgs; [
              python3
              python3Packages.fonttools
              python3Packages.brotli
            ];
            buildPhase = ''
              python3 ./scripts/build_web_db.py
              # Variant of scripts/build_web_fonts.sh, but using nixpkgs noto color emoji
              mkdir -p www/fonts
              pyftsubset ${pkgs.noto-fonts-color-emoji}/share/fonts/noto/NotoColorEmoji.ttf \
                --unicodes=20,26a0,2b06,2b07,1f984 --flavor=woff2 --output-file=./www/fonts/NotoColorEmoji.subset.woff2
            '';
            installPhase = "cp -r www $out";
          };
        };
      }
    );
}
