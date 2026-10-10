#!/usr/bin/env bash
# Alinea los tipos de opencode de cada plugin con la versión instalada en ../opencode
# (ejecútalo tras su update.sh) y actualiza el resto de herramientas de desarrollo a la última versión.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE="$(dirname "$DIR")/opencode"

# Versión fijada en el package.json de la app de opencode.
version_of() {
  node -p "require('$2/app/package.json').dependencies['$1']"
}
v="$(version_of @opencode/cli "$OPENCODE")"

for plugin in "$DIR"/*/; do
  [[ -f "$plugin/package.json" ]] || continue
  echo "==> $(basename "$plugin") (opencode $v)"
  npm install --prefix "$plugin" --save-exact --save-dev --no-fund --no-audit \
    "@opencode/plugin@$v" typescript@latest vitest@latest @types/node@latest
  npm --prefix "$plugin" run --silent typecheck
  npm --prefix "$plugin" test --silent
done
