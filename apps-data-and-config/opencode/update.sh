#!/usr/bin/env bash
# Actualiza opencode y el plugin de Hindsight a la última versión publicada (regenera package.json y package-lock.json).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# El postinstall de npm ejecuta el binario: aislarlo también aquí.
source "$SVC/env.sh"

npm install --prefix "$SVC/app" --save-exact --no-fund --no-audit "@opencode/cli@latest" "@vectorize-io/hindsight-coding-agents@latest"
"$SVC/app/node_modules/.bin/opencode" --version
