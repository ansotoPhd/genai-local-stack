#!/usr/bin/env bash
# Arranca el launcher web en primer plano. Ctrl+C lo cierra y para todo lo que arrancó.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in "$SVC/app/.venv/bin/python" "$SVC/config/.env"; do
  [[ -e "$f" ]] || { echo "Falta $f. Ejecuta $SVC/install.sh" >&2; exit 1; }
done

cd "$SVC/app"
exec "$SVC/app/.venv/bin/python" -m launcher
