#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="universal-apple-darwin"
OUT="$ROOT/artifacts/macos"
TARGET_DIR="$ROOT/src-tauri/target/$TARGET/release/bundle"

cd "$ROOT"
"$ROOT/scripts/setup-macos.sh"
mise exec -- rustup target add aarch64-apple-darwin x86_64-apple-darwin

APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}" \
SOMA_SIDECAR_TARGET="$TARGET" \
mise exec -- pnpm tauri build --target "$TARGET" --bundles app,dmg

APP="$TARGET_DIR/macos/Soma.app"
DMG="$(find "$TARGET_DIR/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)"

if [[ ! -d "$APP" || -z "$DMG" ]]; then
  echo "Expected macOS bundles were not produced in $TARGET_DIR" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
ditto "$APP" "$OUT/Soma.app"
cp "$DMG" "$OUT/"

codesign --verify --deep --strict "$OUT/Soma.app"
lipo -archs "$OUT/Soma.app/Contents/MacOS/soma"

(
  cd "$OUT"
  shasum -a 256 "$(basename "$DMG")" > SHA256SUMS.txt
)

echo "macOS app: $OUT/Soma.app"
echo "macOS installer: $OUT/$(basename "$DMG")"
