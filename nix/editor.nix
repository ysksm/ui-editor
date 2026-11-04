# The original PoC editor (original-poc/app/dist), built with pnpm from the lockfile.
{
  lib,
  stdenvNoCC,
  nodejs,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  version,
}:
let
  # pnpm installs only the native packages for the build platform, so the
  # dependency hash differs per system. On a hash mismatch, nix prints the
  # right value: put it here.
  pnpmDepsHash =
    {
      x86_64-linux = "sha256-MlTfKO/LpGZ+4QApy8/esX88CaKtPFVyVBjk8DTP8uI=";
    }
    .${stdenvNoCC.hostPlatform.system};
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "ui-editor-poc";
  inherit version;

  # The workspace manifests are needed for a frozen-lockfile install.
  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: _type:
      !(builtins.elem (baseNameOf path) [
        "node_modules"
        "dist"
        "export"
        "out"
      ]);
  };

  pnpmWorkspaces = [ "@ui-editor/poc-app..." ];
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      version
      src
      pnpmWorkspaces
      ;
    inherit pnpm;
    fetcherVersion = 4;
    hash = pnpmDepsHash;
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
  ];

  buildPhase = ''
    runHook preBuild
    pnpm --filter "@ui-editor/poc-app..." build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    cp -r original-poc/app/dist $out
    runHook postInstall
  '';
})
