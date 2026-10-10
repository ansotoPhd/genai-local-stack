#!/usr/bin/env bash
# Crea la config local desde las plantillas y descarga la imagen fijada en app/compose.yaml.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

"$SVC/compose.sh" pull --quiet
