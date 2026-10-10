#!/usr/bin/env bash
# docker compose sobre este servicio con config/.env (p. ej. ./compose.sh ps, ./compose.sh logs -f).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ -f "$SVC/config/.env" ]] || { echo "Falta $SVC/config/.env. Ejecuta $SVC/install.sh" >&2; exit 1; }

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
export HOST_UID HOST_GID

exec docker compose --project-directory "$SVC/app" -f "$SVC/app/compose.yaml" --env-file "$SVC/config/.env" "$@"
