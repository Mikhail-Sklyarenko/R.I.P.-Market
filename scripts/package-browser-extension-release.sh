#!/usr/bin/env bash
# Build browser-extension and create a zip for GitHub Releases.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$REPO_ROOT/browser-extension/manifest.json','utf8')).version")"
ZIP_NAME="rip-market-browser-extension-v${VERSION}.zip"
OUT_DIR="$REPO_ROOT/browser-extension"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

echo "==> extension orchestrator"
cd "$REPO_ROOT/extension"
npm ci
npm test

echo "==> browser-extension build"
cd "$OUT_DIR"
npm ci
npm run build

echo "==> zip dist/"
rm -f "$ZIP_PATH"
(cd "$OUT_DIR" && zip -rq "$ZIP_NAME" dist)

echo "Created: $ZIP_PATH"
echo "Upload: gh release create browser-extension-v${VERSION} \"$ZIP_PATH\" --title \"Browser Extension v${VERSION}\""
