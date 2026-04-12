#!/usr/bin/env bash
# Serve dist/ at http://localhost:4173 (requires prior build).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -f dist/index.html ]]; then
  echo "dist/index.html not found. Run ./deploy/build.sh or npm run build first." >&2
  exit 1
fi
exec npm run start:dist
