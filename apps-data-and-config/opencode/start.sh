#!/usr/bin/env bash
# Arranca opencode aislado: config en config/, estado (credenciales, sesiones, logs, caché) en data/.
# Se ejecuta siempre desde <repo>/workspace; argumentos extra se pasan a opencode
# (p. ej. `./start.sh mi-proyecto`, `./start.sh run "..."`, `./start.sh debug config`).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SVC/../.." && pwd)"  # SVC = <repo>/apps-data-and-config/opencode
BIN="$SVC/app/node_modules/.bin/opencode"

for f in "$BIN" "$SVC/config/opencode.jsonc" "$SVC/config/.env"; do
  [[ -e "$f" ]] || { echo "Falta $f. Ejecuta $SVC/install.sh" >&2; exit 1; }
done

set -a; source "$SVC/config/.env"; set +a

source "$SVC/env.sh"
# Cada bash no interactivo que lance el agente restaura las rutas XDG del host.
export BASH_ENV="$SVC/host-env.sh"

cd "$ROOT/workspace"
exec "$BIN" "$@"
