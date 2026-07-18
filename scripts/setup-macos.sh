#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "setup:macos only supports macOS" >&2
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install
  echo "Finish installing Xcode Command Line Tools, then run this command again." >&2
  exit 1
fi

if ! command -v mise >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required: https://brew.sh" >&2
    exit 1
  fi
  brew install mise
fi

mise trust "$ROOT/mise.toml"
mise install -y
mise exec -- pnpm install --frozen-lockfile

echo "Soma development environment is ready."
