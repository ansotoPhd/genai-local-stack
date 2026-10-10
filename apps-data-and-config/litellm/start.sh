#!/usr/bin/env bash
# Arranca el proxy LiteLLM con config/config.yaml y config/.env. Argumentos extra se pasan a litellm.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in "$SVC/app/.venv/bin/litellm" "$SVC/config/config.yaml" "$SVC/config/.env"; do
  [[ -e "$f" ]] || { echo "Falta $f. Ejecuta $SVC/install.sh" >&2; exit 1; }
done

set -a; source "$SVC/config/.env"; set +a

# Prisma (cliente de BD) descarga su CLI y motores: a data/ en vez de ~/.cache.
export PRISMA_HOME_DIR="$SVC/data/prisma"
export PRISMA_NODEENV_CACHE_DIR="$SVC/data/prisma/nodeenv"

# Con BD, Postgres debe estar arrancado: LiteLLM aplica las migraciones al iniciar.
if [[ -n "${DATABASE_URL:-}" ]]; then
  db_hostport="${DATABASE_URL#*@}"
  db_hostport="${db_hostport%%/*}"
  if ! (exec 3<>"/dev/tcp/${db_hostport%:*}/${db_hostport##*:}") 2>/dev/null; then
    echo "No hay Postgres en $db_hostport (DATABASE_URL). Arráncalo con apps-data-and-config/postgres/start.sh" >&2
    echo "o comenta DATABASE_URL en $SVC/config/.env para usar LiteLLM sin BD." >&2
    exit 1
  fi
fi

# Cualquier fichero que genere LiteLLM en el directorio actual queda en data/.
cd "$SVC/data"
exec "$SVC/app/.venv/bin/litellm" \
  --config "$SVC/config/config.yaml" \
  --host 127.0.0.1 \
  --port "${LITELLM_PORT:-4000}" \
  "$@"
