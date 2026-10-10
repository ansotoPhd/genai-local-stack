#!/usr/bin/env bash
# Sube OpenChamber a la última versión publicada (regenera package.json y package-lock.json).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE24="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin 2>/dev/null | sort -V | tail -1)"
[[ -n "$NODE24" ]] || { echo "Falta Node 24. Instálalo con: nvm install 24" >&2; exit 1; }
export PATH="$NODE24:$PATH"

npm install --prefix "$SVC/app" --save-exact --no-fund --no-audit "@openchamber/web@latest"
"$SVC/app/node_modules/.bin/openchamber" --version
