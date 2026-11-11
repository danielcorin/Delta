# Release Delta

## Local release

Requirements: macOS, mise, Xcode Command Line Tools, GitHub CLI authentication, a Developer ID Application certificate with private key, and a notarytool Keychain profile.

The maintainer's signing identity is `Developer ID Application: wvlen LLC (93W5N4LQL7)`. The script uses the verified `DeltaNotary` Keychain profile. Notarization profiles belong to an Apple account/team, not an individual app. Override with `DEVELOPER_IDENTITY` and `NOTARY_PROFILE`. The profile name is configuration, not a credential. Use `xcrun notarytool store-credentials <profile>` interactively if setting up another machine. Never put passwords or exported signing keys in this repository.

1. Update package.json's version, package-lock.json and `docs/releases/<version>.md`.
2. Commit the finished release changes. The working tree must be clean.
3. Run:

```sh
mise exec -- npm run release -- --prepare
mise exec -- npm run release -- --draft
```

Prepare runs strict typechecking, lint, boundary tests, dependency audit, a Developer ID-signed build, hidden-window Electron end-to-end tests, and a launch of the signed packaged executable. It submits the app to Apple, staples and assesses it with Gatekeeper, creates a signed DMG, notarizes/staples/assesses that DMG, and emits a ZIP, source archive, manifest and SHA-256 checksums in `release/<version>/`.

Draft uploads only these verified artifacts. It never pushes source, creates a public release, or changes main. The private draft initially references main; its attached manifest and source archive identify the built commit. This lets Dan try the build before making the source and release public.

After approval, from the same clean commit:

```sh
mise exec -- npm run release -- --publish
```

Publish downloads and verifies the draft assets against the local checksums, requires main to be an ancestor of the built commit, pushes that commit explicitly to main, updates the draft target to that commit, and publishes. It never force-pushes or silently rebuilds different source. If main has diverged, reconcile and prepare a new build.

Use the DMG or ZIP from the draft for local testing. Keep the app signature intact. There is no need to remove quarantine or disable Gatekeeper.

For a locally built Developer ID-signed app, `scripts/install.sh --development` installs it in `/Applications` without launching or changing the library. This explicit local-development mode skips notarization assessment; ordinary `scripts/install.sh` requires a notarized app. Neither mode disables Gatekeeper or changes quarantine attributes.

## Architectures

The release command verifies on the native host architecture. Apple silicon is the verified 0.2.0 target. Intel cross-packaging is supported:

```sh
mise exec -- npm run package -- --platform=darwin --arch=x64
```

Cross-packaging fetches sqlite-vec's target-architecture binary from the lockfile and verifies its SHA-512 integrity before unpacking. Native Intel verification is required before offering that download; this Mac cannot execute x64 binaries.

sqlite-vec 0.1.9's macOS binary requires macOS 14. Do not lower the app's documented minimum without rebuilding and testing that extension.

## GitHub Actions

`check.yml` runs checks, packages and tests on hosted Apple silicon and Intel macOS runners and uploads unsigned CI ZIPs plus UI verification artifacts. These ZIPs are development artifacts, not notarized releases.

`release.yml` is manually dispatched and uses the same local release script. It intentionally keeps signing keys off GitHub-hosted machines. It requires a dedicated self-hosted runner labeled `macOS`, `ARM64`, `delta-release`, with the signing identity/notary profile available and an approved `release` environment. Registering that persistent runner is an explicit operator setup step; none was installed during this revival. Do not run untrusted pull requests on that runner.

Until a signing runner is registered, the local commands above are the complete release path. The workflows will have their first remote run after the source is pushed.

## Verification coverage

- 26 boundary tests: migration idempotence, SQLite/FTS/Unicode search, subtree and conversation deletion, offline combined search, credential migration/failure safety, secret redaction, endpoint validation, pagination and provider protocol streaming.
- Electron end-to-end: model search, image paste, send, root-edit branching, cancellation with persisted partial response, configured Ollama URL, provider error handling, search navigation, settings in chat-only mode, secret storage, full-library export and backup integrity.
- Screenshots: light/dark, reduced motion, compact window and enlarged text.
- Signed executable smoke: fresh library startup, SQLite vector extension, renderer/preload bridge.
- npm audit: zero known vulnerabilities at preparation time.

Cloud endpoints use local protocol fixtures in tests. Live paid-account calls are not part of the suite. Cached/manual model IDs are intentionally allowed to fail with an actionable error when access or capabilities change.
