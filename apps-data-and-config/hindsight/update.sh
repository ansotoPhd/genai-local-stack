#!/usr/bin/env bash
# Actualiza la API y la UI de Hindsight a la última versión (regenera uv.lock y package-lock.json).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv lock --project "$SVC/app" --upgrade
npm install --prefix "$SVC/app" --save-exact --no-fund --no-audit @vectorize-io/hindsight-control-plane@latest
"$SVC/install.sh"
