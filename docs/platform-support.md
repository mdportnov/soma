# Platform support

## Runtime targets

| Platform | Supported release target | Primary installation path |
| -------- | ------------------------ | ------------------------- |
| macOS    | macOS 13+, arm64 and x64 | Universal DMG             |
| Windows  | Windows 10 1809+ x64     | Current-user NSIS setup   |
| Linux    | Modern glibc x64 desktop | Native `.deb`/`.rpm`      |

The embedded MCP server is a Bun standalone executable. Bun requires macOS 13 or later and Windows
10 1809 or later, so those boundaries supersede Tauri's broader shell-only compatibility. The x64
Windows and Linux sidecars use Bun's baseline CPU target to avoid an AVX2 requirement.

The Linux release is built on Ubuntu 22.04. Tauri recommends Ubuntu 22.04 or Debian 12 as the oldest
practical WebKitGTK 4.1 build baseline and warns that building on newer glibc raises the minimum
runtime version. This baseline is intentional: the package runs forward on current Ubuntu,
Debian and compatible distributions. A weekly package smoke build also runs on `ubuntu-latest`.

## Build hosts

| Host    | Automated setup                                                                 |
| ------- | ------------------------------------------------------------------------------- |
| macOS   | Xcode Command Line Tools, Homebrew, then `scripts/build-macos.sh`               |
| Windows | WinGet, Microsoft C++ Build Tools with VCTools workload, then PowerShell script |
| Linux   | apt, dnf or pacman system dependencies, then `scripts/build-linux.sh`           |

The Windows distribution uses NSIS instead of MSI. Tauri's MSI builder depends on the deprecated
VBSCRIPT Windows optional feature, while NSIS does not. The installer uses current-user mode, so it
does not request administrator privileges, and embeds the WebView2 bootstrapper for systems where
the runtime is absent.

Linux package dependencies follow the current Tauri prerequisites: WebKitGTK 4.1, OpenSSL,
AppIndicator, librsvg and xdo development packages. The `.deb` carries runtime dependency metadata
and a desktop entry; the `.rpm` serves RPM distributions; the AppImage is the portable fallback.

## Upstream references

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Debian packaging and glibc baseline](https://v2.tauri.app/distribute/debian/)
- [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)
- [Bun system and CPU requirements](https://bun.com/docs/installation)
- [Bun standalone cross-compilation targets](https://bun.com/docs/bundler/executables)
- [GitHub-hosted runner images](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Microsoft Smart App Control](https://learn.microsoft.com/windows/apps/develop/smart-app-control/overview)
- [Apple first-launch approval](https://support.apple.com/guide/mac-help/mh40616/mac)
