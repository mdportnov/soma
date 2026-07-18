#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts/linux"
TARGET_DIR="$ROOT/src-tauri/target/release/bundle"

cd "$ROOT"
"$ROOT/scripts/setup-linux.sh"
if command -v mise >/dev/null 2>&1; then
  MISE="$(command -v mise)"
else
  MISE="$HOME/.local/bin/mise"
fi
"$MISE" exec -- pnpm tauri build --bundles deb,rpm,appimage

rm -rf "$OUT"
mkdir -p "$OUT"

find "$TARGET_DIR" -maxdepth 2 -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) \
  -exec cp {} "$OUT/" \;

if ! find "$OUT" -maxdepth 1 -type f -name '*.deb' -print -quit | grep -q . || \
  ! find "$OUT" -maxdepth 1 -type f -name '*.rpm' -print -quit | grep -q . || \
  ! find "$OUT" -maxdepth 1 -type f -name '*.AppImage' -print -quit | grep -q .; then
  echo "Expected Linux bundles were not produced in $TARGET_DIR" >&2
  exit 1
fi

chmod +x "$OUT"/*.AppImage
(
  cd "$OUT"
  sha256sum -- * > SHA256SUMS.txt
)

echo "Linux installers: $OUT"
