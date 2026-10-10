#!/usr/bin/env bash
# Instala las herramientas de desarrollo de los plugins propios (tipos de opencode, TypeScript, vitest).
# Solo hace falta para desarrollar o pasar los tests: opencode carga los plugins sin instalar nada.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for plugin in "$DIR"/*/; do
  [[ -f "$plugin/package-lock.json" ]] || continue
  echo "==> $(basename "$plugin")"
  npm ci --prefix "$plugin" --no-fund --no-audit
done
