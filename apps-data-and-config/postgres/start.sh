#!/usr/bin/env bash
# Arranca Postgres en segundo plano y espera a que acepte conexiones. Argumentos extra se pasan a `up`.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! grep -q '^POSTGRES_PASSWORD=.' "$SVC/config/.env" 2>/dev/null; then
  echo "Falta POSTGRES_PASSWORD en $SVC/config/.env (ejecuta setup.sh o rellénala)" >&2
  exit 1
fi

"$SVC/compose.sh" up -d --wait "$@"
port="$(sed -n 's/^POSTGRES_PORT=//p' "$SVC/config/.env" | tail -n 1)"
echo "Postgres en 127.0.0.1:${port:-15432}"
