#!/usr/bin/env bash

set -euo pipefail

EXTENSION_NAME="portal-capture"
DIST_DIR="dist"
MANIFEST_FILE="manifest.json"
INCLUDE_ITEMS=("manifest.json" "build" "icons" "options" "popup" "styles")

npm install
npm test
npx tsc --noEmit
npm run build

mkdir -p "$DIST_DIR"

if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "Error: $MANIFEST_FILE not found in the current directory."
  exit 1
fi

VERSION=$(node -p "require('./manifest.json').version")
if [[ -z "$VERSION" ]]; then
  echo "Error: Could not extract version from $MANIFEST_FILE."
  exit 1
fi

ZIP_FILE="$DIST_DIR/${EXTENSION_NAME}-${VERSION}.zip"
echo "Packaging extension version $VERSION into $ZIP_FILE..."
zip -r "$ZIP_FILE" "${INCLUDE_ITEMS[@]}"

echo "Done."
