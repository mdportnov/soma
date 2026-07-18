# Release runbook

## Distribution contract

- `package.json` is the application-version source of truth. Tauri reads it directly.
- `mcp/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and a `v<version>` Git tag must
  match it. `pnpm version:check` enforces this locally and in CI.
- Node, pnpm, Rust and Bun versions are pinned in the repository. The root `pnpm-lock.yaml` covers
  both the application and the MCP workspace.
- A release is published only after the web quality gates and every native platform build succeed.
- Every release contains `SHA256SUMS.txt` generated from the uploaded installers.
- The in-app update check reads the public stable release from GitHub and opens its release page;
  installation remains manual on every platform.

## Prepare and publish

Start from a clean, current `master` branch:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm release:prepare 0.2.0
```

The preparation command updates all version locations and moves the current Unreleased changelog
content under the new version and date. Review the result, then run:

```sh
pnpm verify
git add package.json mcp/package.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
git commit -m "release: v0.2.0"
git tag -a v0.2.0 -m "Soma v0.2.0"
git push origin master v0.2.0
```

The tag starts `.github/workflows/release.yml`. It creates a draft release, builds the complete
matrix, uploads installers, generates checksums and publishes the release. A failed job leaves the
release as a draft; fix the cause and rerun the failed jobs or replace the tag before publishing.

Prerelease versions use SemVer suffixes such as `0.3.0-beta.1`. Their GitHub releases are marked as
prereleases automatically.

## Artifacts

| Platform | Architecture        | Artifacts                   |
| -------- | ------------------- | --------------------------- |
| macOS    | Universal arm64+x64 | `.dmg`, application bundle  |
| Windows  | x64                 | NSIS `-setup.exe`           |
| Linux    | x64                 | `.deb`, `.rpm`, `.AppImage` |

The macOS build includes a universal Bun MCP sidecar and a universal Rust/Tauri application. The
local `pnpm build:macos` path produces the same architecture combination under `artifacts/macos/`.

## Desktop signing policy

Soma intentionally has no Apple Developer certificate. Local and CI builds use the ad-hoc signing
identity `-`; there are no Apple credentials or signing secrets to configure.

The consequence is fixed by macOS: downloaded releases cannot be notarized and Gatekeeper blocks
the first launch. The user must try to open Soma once and then approve it in **System Settings →
Privacy & Security → Open Anyway**. This is a GUI-only, one-time step; later launches work normally
from Applications, Finder, Spotlight, Launchpad and the Dock.

Do not claim that the macOS artifact is notarized or from an identified developer. If the signing
policy changes later, add Developer ID signing and notarization as a separate reviewed change.

The Windows installer is also unsigned. SmartScreen can display an unknown-publisher warning, and
Smart App Control in enforcement mode can reject an unknown unsigned build without a per-app
exception. Normal installation on those machines requires a trusted Windows code-signing identity
or a signed Microsoft Store distribution. Linux packages are unsigned; release SHA-256 checksums
provide transport-integrity verification on every platform.

## Release verification

Before announcing a release:

1. Confirm the GitHub Actions release workflow is green.
2. Confirm the release is public and contains macOS, Windows, Linux and `SHA256SUMS.txt` assets.
3. Install the downloaded universal DMG on a clean Mac user account.
4. Complete the Gatekeeper approval and launch Soma from Applications.
5. Confirm onboarding opens, a record survives restart, and the MCP sidecar setup reports a bundled
   executable.
