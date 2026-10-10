#!/usr/bin/env bash
# Actualiza grafana/otel-lgtm a la última versión publicada (tag fijado en app/compose.yaml)
# y recrea el contenedor si está arrancado.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SVC/app/compose.yaml"

current="$(sed -n 's|^ *image: grafana/otel-lgtm:||p' "$COMPOSE")"
latest="$(curl -fsSL https://api.github.com/repos/grafana/docker-otel-lgtm/releases/latest \
  | sed -n 's/^ *"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p')"

if [[ -z "$latest" ]]; then
  echo "No se pudo consultar la última versión en GitHub" >&2
  exit 1
elif [[ "$latest" != "$current" ]]; then
  sed -i.bak "s|grafana/otel-lgtm:$current|grafana/otel-lgtm:$latest|" "$COMPOSE" && rm "$COMPOSE.bak"
  echo "grafana/otel-lgtm: $current -> $latest"
else
  echo "grafana/otel-lgtm ya está en la última versión ($current)"
fi

"$SVC/compose.sh" pull --quiet
if [[ -n "$("$SVC/compose.sh" ps -q)" ]]; then
  "$SVC/compose.sh" up -d --wait
fi
