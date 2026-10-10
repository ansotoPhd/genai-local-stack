#!/usr/bin/env bash
# Arranca Hindsight: la API y la UI (control plane) a la vez; Ctrl+C para ambas.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="$SVC/app/.venv/bin/hindsight-api"
UI="$SVC/app/node_modules/.bin/hindsight-control-plane"

for f in "$API" "$UI" "$SVC/config/.env"; do
  [[ -e "$f" ]] || { echo "Falta $f. Ejecuta $SVC/install.sh" >&2; exit 1; }
done

set -a; source "$SVC/config/.env"; set +a

# El modelo de embeddings se descarga en data/hf en vez de ~/.cache/huggingface.
export HF_HOME="$SVC/data/hf"

# Postgres debe estar arrancado. La BD se crea si falta (p. ej. si data/ de Postgres es anterior).
"$SVC/app/.venv/bin/python" - <<'PY'
import asyncio, os, sys
from urllib.parse import urlsplit, urlunsplit

import asyncpg

url = urlsplit(os.environ["HINDSIGHT_API_DATABASE_URL"])
db = url.path.lstrip("/")


async def main():
    try:
        conn = await asyncpg.connect(urlunsplit(url._replace(path="/postgres")), timeout=5)
    except (OSError, asyncpg.PostgresError) as e:
        sys.exit(f"No hay Postgres en {url.hostname}:{url.port} ({e}).\n"
                 "Arráncalo con apps-data-and-config/postgres/start.sh")
    try:
        if not await conn.fetchval("select 1 from pg_database where datname = $1", db):
            await conn.execute(f'create database "{db}"')
            print(f"Creada la BD {db}")
    finally:
        await conn.close()


asyncio.run(main())
PY

api_url="http://$HINDSIGHT_API_HOST:$HINDSIGHT_API_PORT"
echo "API Hindsight: $api_url"
echo "UI Hindsight:  http://$HINDSIGHT_API_HOST:${HINDSIGHT_CP_PORT:-9999}"

# Cualquier fichero que generen en el directorio actual queda en data/. Si uno de los dos
# procesos termina (o Ctrl+C), se para el otro y se espera a que ambos acaben.
cd "$SVC/data"
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true; wait' EXIT
"$API" & pids+=($!)
"$UI" --hostname "$HINDSIGHT_API_HOST" --port "${HINDSIGHT_CP_PORT:-9999}" --api-url "$api_url" & pids+=($!)
wait -n
