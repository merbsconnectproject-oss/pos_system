#!/usr/bin/env bash
# Pull the frozen contract vectors from the frontend repo.
# Vectors are GENERATED there (npm run gen:vectors) and vendored here, so the
# Java suite and the TypeScript suite assert against identical expectations.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$HERE/../pos-system/docs/contract/test-vectors.json}"
DEST="$HERE/src/test/resources/test-vectors.json"
[ -f "$SRC" ] || { echo "not found: $SRC" >&2; echo "run: cd ../pos-system && npm run gen:vectors" >&2; exit 1; }
cp "$SRC" "$DEST"
echo "synced $(basename "$DEST") <- $SRC"
