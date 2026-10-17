#!/usr/bin/env bash
# Generate build/icon.png and build/icon.ico from a square logo PNG (e.g. 1024×1024).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:?Usage: $0 /path/to/logo.png}"
BUILD="$ROOT/build"
mkdir -p "$BUILD"

TMP="$BUILD/_icon_src.png"
cp "$SRC" "$TMP"

# Emblema superior (sin texto) — ajusta cropOffset/crop si cambias el arte
sips --cropToHeightWidth 635 635 --cropOffset 40 0 "$TMP" --out "$BUILD/emblem.png" >/dev/null
sips -z 512 512 "$BUILD/emblem.png" --out "$BUILD/icon.png" >/dev/null

for S in 16 32 48 64 128 256; do
  sips -z "$S" "$S" "$BUILD/emblem.png" --out "$BUILD/icon-$S.png" >/dev/null
done

(
  cd "$BUILD"
  npx --yes png-to-ico icon-16.png icon-32.png icon-48.png icon-64.png icon-128.png icon-256.png > icon.ico
)

rm -f "$TMP" "$BUILD/emblem.png" "$BUILD"/icon-{16,32,48,64,128,256}.png
echo "Wrote $BUILD/icon.ico and $BUILD/icon.png"
