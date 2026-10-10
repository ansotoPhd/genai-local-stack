#!/usr/bin/env bash
# Instala la API de Hindsight en app/.venv (uv.lock) y su UI en app/node_modules (package-lock.json),
# y crea la config local desde las plantillas.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv sync --project "$SVC/app" --locked
npm ci --prefix "$SVC/app" --no-fund --no-audit

shopt -s nullglob dotglob
for tpl in "$SVC"/config/*.example*; do
  name="$(basename "$tpl")"
  real="$SVC/config/${name/.example/}"
  if [[ ! -e "$real" ]]; then
    cp "$tpl" "$real"
    echo "Creado ${real#"$SVC/"} desde la plantilla"
  fi
done
chmod 600 "$SVC/config/.env"
