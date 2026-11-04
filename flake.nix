{
  description = "ui-editor: the original PoC editor as a static web app";

  # nixos-26.05 ships pnpm 11 (what the lockfile is made with).
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      version = self.shortRev or self.dirtyShortRev or "dev";
    in
    {
      packages = forAllSystems (pkgs: rec {
        editor = pkgs.callPackage ./nix/editor.nix { inherit version; };
        default = editor;
      });
    };
}
