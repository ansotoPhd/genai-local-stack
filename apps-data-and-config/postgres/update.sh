#!/usr/bin/env bash
# Actualiza la imagen pgvector a la última publicada para la misma versión mayor de Postgres
# (tag fijado en app/compose.yaml) y recrea el contenedor si está arrancado.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SVC/app/compose.yaml"

current="$(sed -n 's|^ *image: pgvector/pgvector:||p' "$COMPOSE")"
suffix="-${current#*-}"   # p. ej. -pg18-trixie: no cambia de versión mayor (requiere dump/restore)
latest="$(curl -fsSL "https://hub.docker.com/v2/repositories/pgvector/pgvector/tags?page_size=100&name=$suffix" \
  | grep -oE "\"[0-9]+\.[0-9]+\.[0-9]+$suffix\"" | tr -d '"' | sort -V | tail -n 1)"

if [[ -z "$latest" ]]; then
  echo "No se pudo consultar la última versión en Docker Hub" >&2
  exit 1
elif [[ "$latest" != "$current" ]]; then
  sed -i.bak "s|pgvector/pgvector:$current|pgvector/pgvector:$latest|" "$COMPOSE" && rm "$COMPOSE.bak"
  echo "pgvector/pgvector: $current -> $latest"
else
  echo "pgvector/pgvector ya está en la última versión ($current)"
fi

"$SVC/compose.sh" pull --quiet
if [[ -n "$("$SVC/compose.sh" ps -q)" ]]; then
  "$SVC/compose.sh" up -d --wait
fi
