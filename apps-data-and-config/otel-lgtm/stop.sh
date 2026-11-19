#!/usr/bin/env bash
# Para y elimina el contenedor de otel-lgtm. Los datos se conservan en data/;
# con -v (./stop.sh -v) se borran también (lo usa «Borrar datos» en el launcher).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SVC/compose.sh" down "$@"

for arg in "$@"; do
  if [[ "$arg" == "-v" || "$arg" == "--volumes" ]]; then
    # Los datos son un bind mount (no un volumen Docker): down -v no los toca. Se vacía data/
    # conservando .gitkeep.
    find "$SVC/data" -mindepth 1 ! -name .gitkeep -delete
    echo "Datos de otel-lgtm borrados ($SVC/data)"
    break
  fi
done
