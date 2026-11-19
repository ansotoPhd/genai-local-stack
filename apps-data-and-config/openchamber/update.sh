#!/usr/bin/env bash
# Sube OpenChamber a la última versión publicada (regenera package.json y package-lock.json).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SVC/node24.sh"
NODE24="$(find_node24)" || { echo "$NODE24_MISSING_MSG" >&2; exit 1; }
export PATH="$NODE24:$PATH"

npm install --prefix "$SVC/app" --save-exact --no-fund --no-audit "@openchamber/web@latest"
"$SVC/app/node_modules/.bin/openchamber" --version
