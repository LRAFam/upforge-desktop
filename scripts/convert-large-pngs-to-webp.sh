#!/usr/bin/env bash
# Convert bundled PNG assets over 100KB to WebP (quality 85) and remove originals.
# Skips files that already have a newer-or-equal .webp sibling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIN_BYTES=102400
QUALITY=85

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp not found — install libwebp (brew install webp)" >&2
  exit 1
fi

converted=0
skipped=0

while IFS= read -r -d '' png; do
  size=$(stat -f%z "$png" 2>/dev/null || stat -c%s "$png")
  if [ "$size" -lt "$MIN_BYTES" ]; then
    continue
  fi

  webp="${png%.png}.webp"
  if [ -f "$webp" ] && [ "$webp" -nt "$png" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  cwebp -quiet -q "$QUALITY" "$png" -o "$webp"
  rm "$png"
  converted=$((converted + 1))
  echo "converted: ${png#$ROOT/}"
done < <(find "$ROOT/src/assets" -type f -name '*.png' -print0)

echo "done: converted=$converted skipped=$skipped"
