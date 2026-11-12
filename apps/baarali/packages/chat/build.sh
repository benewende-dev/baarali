#!/usr/bin/env bash
# Baarali in the browser: brands the phone app (scripts/brand.mjs --only mobile)
# on a clean checkout, exports its web build into dist/. Run from anywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
node "$root/apps/baarali/packages/desktop/scripts/brand.mjs" --only mobile --yes
rm -rf "$here/dist"
(cd "$root/apps/x/apps/mobile" && NODE_OPTIONS=--max-old-space-size=8192 CI=1 npx expo export -p web --output-dir "$here/dist")
echo "dist ready: $here/dist"
