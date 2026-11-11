#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---help}"
version="$(node -p "require('./package.json').version")"
tag="v$version"
arch="${RELEASE_ARCH:-$(node -p process.arch)}"
repo="${GH_REPO:-danielcorin/Delta}"
profile="${NOTARY_PROFILE:-RecoNotary}"
identity="${DEVELOPER_IDENTITY:-Developer ID Application: wvlen LLC (93W5N4LQL7)}"
output="$PWD/release/$version"
app="$PWD/out/Delta-darwin-$arch/Delta.app"
fail() { echo "error: $*" >&2; exit 1; }
clean() { [[ -z "$(git status --porcelain)" ]] || fail "Commit all release changes first. Releases require a clean tree."; }
verify_assets() {
  [[ -f "$output/SHA256SUMS" ]] || fail "Run --prepare first."
  (cd "$output" && shasum -a 256 -c SHA256SUMS)
  [[ "$(node -p "require('$output/manifest.json').commit")" == "$(git rev-parse HEAD)" ]] || fail "Artifacts belong to a different commit. Rebuild them."
}
notarize() {
  local result="$2"
  xcrun notarytool submit "$1" --keychain-profile "$profile" --wait --timeout 30m --output-format json > "$result"
  node -e 'const r=require(process.argv[1]); if(r.status!=="Accepted") { console.error("Notarization failed. Submission:",r.id); process.exit(1); }' "$result"
}
case "$mode" in
  --prepare)
    clean
    [[ "$(uname)" == Darwin ]] || fail "macOS is required."
    [[ "$arch" == "$(node -p process.arch)" ]] || fail "Release verification must run on the target architecture. Use the CI runner for Intel builds."
    security find-identity -v -p codesigning | grep -F "$identity" >/dev/null || fail "Developer ID certificate is unavailable."
    xcrun notarytool history --keychain-profile "$profile" >/dev/null
    mkdir -p "$output"
    npm run check
    npm audit --audit-level=moderate
    DELTA_SIGN=1 DEVELOPER_IDENTITY="$identity" npm run package -- --platform=darwin --arch="$arch"
    DELTA_ARCH="$arch" npm run test:app
    node scripts/smoke.mjs "$app"
    codesign --verify --deep --strict "$app"
    codesign -dv --verbose=4 "$app" 2>&1 | grep -F "Authority=$identity" >/dev/null
    submission="$output/Delta-$version-$arch-submission.zip"
    ditto -c -k --keepParent "$app" "$submission"
    notarize "$submission" "$output/app-notary.json"
    xcrun stapler staple "$app"
    xcrun stapler validate "$app"
    spctl --assess --type execute --verbose=2 "$app"
    rm "$submission"
    ditto -c -k --keepParent "$app" "$output/Delta-$version-$arch.zip"
    staging="$(mktemp -d)"
    trap 'rm -rf "$staging"' EXIT
    ditto "$app" "$staging/Delta.app"
    ln -s /Applications "$staging/Applications"
    hdiutil create -volname Delta -srcfolder "$staging" -ov -format UDZO "$output/Delta-$version-$arch.dmg"
    codesign --force --sign "$identity" --timestamp "$output/Delta-$version-$arch.dmg"
    notarize "$output/Delta-$version-$arch.dmg" "$output/dmg-notary.json"
    xcrun stapler staple "$output/Delta-$version-$arch.dmg"
    xcrun stapler validate "$output/Delta-$version-$arch.dmg"
    spctl --assess --type open --context context:primary-signature --verbose=2 "$output/Delta-$version-$arch.dmg"
    git archive --format=tar.gz --prefix="Delta-$version/" HEAD > "$output/Delta-$version-source.tar.gz"
    RELEASE_VERSION="$version" RELEASE_ARCH="$arch" RELEASE_COMMIT="$(git rev-parse HEAD)" node -e '
      require("fs").writeFileSync(process.argv[1], JSON.stringify({
        version: process.env.RELEASE_VERSION, arch: process.env.RELEASE_ARCH,
        commit: process.env.RELEASE_COMMIT, bundleId: "llc.wvlen.delta",
        verified: ["typecheck", "lint", "boundary-tests", "electron-e2e", "signed-native-smoke", "notarization", "gatekeeper"],
      }, null, 2) + "\n");
    ' "$output/manifest.json"
    (cd "$output" && shasum -a 256 "Delta-$version-$arch.zip" "Delta-$version-$arch.dmg" "Delta-$version-source.tar.gz" manifest.json > SHA256SUMS)
    echo "Verified artifacts: $output"
    echo "Next: npm run release -- --draft"
    ;;
  --draft)
    clean; verify_assets
    gh auth status
    if gh release view "$tag" --repo "$repo" --json isDraft >/dev/null 2>&1; then
      [[ "$(gh release view "$tag" --repo "$repo" --json isDraft --jq .isDraft)" == true ]] || fail "Never replace a published release."
    else
      # A private draft may precede pushing source. Publish updates its target to
      # the exact manifest commit only after a fast-forward source push succeeds.
      gh release create "$tag" --repo "$repo" --draft --target main --title "Delta $version" --notes-file "docs/releases/$version.md"
    fi
    gh release upload "$tag" --repo "$repo" --clobber "$output/Delta-$version-$arch.zip" "$output/Delta-$version-$arch.dmg" "$output/Delta-$version-source.tar.gz" "$output/manifest.json" "$output/SHA256SUMS"
    gh release view "$tag" --repo "$repo" --json url,isDraft
    ;;
  --publish)
    clean; verify_assets
    [[ "$(gh release view "$tag" --repo "$repo" --json isDraft --jq .isDraft)" == true ]] || fail "An existing draft is required."
    # Verify the uploaded assets, not just the local copies.
    downloads="$(mktemp -d)"
    trap 'rm -rf "$downloads"' EXIT
    gh release download "$tag" --repo "$repo" --dir "$downloads"
    cmp "$output/SHA256SUMS" "$downloads/SHA256SUMS"
    (cd "$downloads" && shasum -a 256 -c SHA256SUMS)
    git fetch origin main
    git merge-base --is-ancestor origin/main HEAD || fail "main diverged. Reconcile it and rebuild."
    git push origin HEAD:refs/heads/main
    gh release edit "$tag" --repo "$repo" --target "$(git rev-parse HEAD)" --draft=false --latest
    ;;
  --help)
    echo "Usage: npm run release -- --prepare | --draft | --publish"
    echo "prepare: test, sign, notarize, staple and verify a native macOS build"
    echo "draft: upload verified artifacts privately; no source push or public release"
    echo "publish: explicitly push source to main and publish the verified draft"
    echo "Overrides: NOTARY_PROFILE, DEVELOPER_IDENTITY, GH_REPO, RELEASE_ARCH"
    ;;
  *) fail "Unknown mode: $mode" ;;
esac
