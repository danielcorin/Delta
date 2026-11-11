#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app="${1:-out/Delta-darwin-$(node -p process.arch)/Delta.app}"
[[ -d "$app" ]] || { echo "Build a release first: npm run release -- --prepare" >&2; exit 1; }
codesign --verify --deep --strict "$app"
spctl --assess --type execute "$app"
if pgrep -f '^/Applications/Delta.app/Contents/MacOS/Delta' >/dev/null; then
  echo "Quit Delta before replacing the installed copy." >&2
  exit 1
fi
staging="$(mktemp -d /Applications/.Delta-install.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
ditto "$app" "$staging/Delta.app"
codesign --verify --deep --strict "$staging/Delta.app"
if [[ -d /Applications/Delta.app ]]; then mv /Applications/Delta.app "$staging/Previous.app"; fi
if ! mv "$staging/Delta.app" /Applications/Delta.app; then
  [[ ! -d "$staging/Previous.app" ]] || mv "$staging/Previous.app" /Applications/Delta.app
  exit 1
fi
echo "Installed /Applications/Delta.app. Open it when ready; your library is unchanged."
