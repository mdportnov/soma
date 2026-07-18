#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "setup:linux only supports Linux" >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file git libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file git \
    libappindicator-gtk3-devel librsvg2-devel libxdo-devel gcc gcc-c++ make patchelf rpm-build
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -Syu --needed --noconfirm webkit2gtk-4.1 base-devel curl wget file git openssl \
    appmenu-gtk-module libappindicator-gtk3 librsvg xdotool patchelf rpm-tools
else
  echo "Supported package managers: apt, dnf and pacman" >&2
  exit 1
fi

if command -v mise >/dev/null 2>&1; then
  MISE="$(command -v mise)"
else
  curl https://mise.run | sh
  MISE="$HOME/.local/bin/mise"
fi

"$MISE" trust "$ROOT/mise.toml"
"$MISE" install -y
"$MISE" exec -- pnpm install --frozen-lockfile

echo "Soma development environment is ready."
