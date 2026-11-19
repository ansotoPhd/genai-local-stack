#!/usr/bin/env bash
# Instala OpenChamber (versión fijada en app/package-lock.json) y crea la config local.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SVC/node24.sh"
NODE24="$(find_node24)" || { echo "$NODE24_MISSING_MSG" >&2; exit 1; }
export PATH="$NODE24:$PATH"

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

# Proyecto por defecto: sin proyecto activo, OpenChamber crea las sesiones en su carpeta de chats
# y el agente ejecuta ahí sus comandos. Se registra el workspace del stack (o OPENCHAMBER_OPENCODE_CWD).
set -a; source "$SVC/config/.env"; set +a
"$SVC/register-project.py"

# Sin contraseña, la UI (que da acceso a un agente con shell) quedaría abierta en la red local.
if ! grep -qE '^OPENCHAMBER_UI_PASSWORD=.+' "$SVC/config/.env"; then
  password="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed -i "s|^OPENCHAMBER_UI_PASSWORD=.*|OPENCHAMBER_UI_PASSWORD=$password|" "$SVC/config/.env"
  echo "Generada OPENCHAMBER_UI_PASSWORD en config/.env"
fi
