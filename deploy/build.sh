#!/usr/bin/env bash
# Build production assets into dist/. Run from repo root via: ./deploy/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -d node_modules ]]; then
  npm run build
else
  npm ci
  npm run build
fi
echo ""
echo "Build OK: $ROOT/dist"
echo "Next: ./deploy/serve.sh   or   npm run start:dist"
