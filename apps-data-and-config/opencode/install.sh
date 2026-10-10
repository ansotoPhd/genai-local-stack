#!/usr/bin/env bash
# Instala opencode en app/node_modules (versión fijada en package-lock.json) y crea la config local desde las plantillas.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# El postinstall de npm ejecuta el binario: aislarlo también aquí.
source "$SVC/env.sh"

npm ci --prefix "$SVC/app" --no-fund --no-audit

shopt -s nullglob dotglob
for tpl in "$SVC"/config/*.example*; do
  name="$(basename "$tpl")"
  real="$SVC/config/${name/.example/}"
  if [[ ! -e "$real" ]]; then
    cp "$tpl" "$real"
    echo "Creado ${real#"$SVC/"}"
  fi
done
chmod 600 "$SVC/config/.env"

# Puerto propio para el servidor en segundo plano (se guarda en config/service.json).
port="$(sed -n 's/^OPENCODE_SERVICE_PORT=//p' "$SVC/config/.env" | tail -n 1)"
"$SVC/app/node_modules/.bin/opencode" service set port "${port:-49380}" > /dev/null
