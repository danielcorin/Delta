#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
output="$root/.cache/icon"
[[ "$(uname)" == Darwin ]] || { echo "Liquid Glass icons require macOS and Xcode 26+." >&2; exit 1; }
version="$(xcrun xcodebuild -version | awk '/^Xcode / {print $2}')"
[[ "${version%%.*}" -ge 26 ]] || { echo "Select full Xcode 26+ with xcode-select; Command Line Tools alone cannot compile .icon packages." >&2; exit 1; }
mkdir -p "$output"
# Absolute paths also avoid assetcatalogd resolving inputs against another build's cwd.
xcrun actool "$root/assets/Assets.xcassets" "$root/assets/AppIcon.icon" \
  --compile "$output" --platform macosx --minimum-deployment-target 14.0 \
  --target-device mac --app-icon AppIcon \
  --output-partial-info-plist "$output/partial-info.plist" \
  --output-format human-readable-text --warnings --notices
node "$root/scripts/verify-icon.mjs" "$output"
if [[ "${1:-}" == --preview ]]; then
  staging="$(mktemp -d)"
  trap 'rm -rf "$staging"' EXIT
  iconutil --convert iconset "$output/AppIcon.icns" --output "$staging/AppIcon.iconset"
  cp "$staging/AppIcon.iconset/icon_128x128@2x.png" "$root/.github/images/delta_icon.png"
fi
