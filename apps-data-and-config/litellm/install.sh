#!/usr/bin/env bash
# Instala LiteLLM en app/.venv (versiones fijadas en uv.lock) y crea la config local desde las plantillas.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv sync --project "$SVC/app" --locked

# Cliente Python de Prisma para la BD (DATABASE_URL): se genera dentro del venv con el schema de
# LiteLLM. La CLI y los motores de Prisma se descargan en data/prisma en vez de ~/.cache.
export PRISMA_HOME_DIR="$SVC/data/prisma"
export PRISMA_NODEENV_CACHE_DIR="$SVC/data/prisma/nodeenv"
schema="$("$SVC/app/.venv/bin/python" -c 'import importlib.util; print(importlib.util.find_spec("litellm").submodule_search_locations[0])')/proxy/schema.prisma"
PATH="$SVC/app/.venv/bin:$PATH" prisma generate --schema "$schema" > /dev/null
# types.py son solo TypedDicts de tipado: con Python 3.14 su import cuesta minutos.
"$SVC/prisma-types-stub.sh" "$SVC/app/.venv/bin/python"

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
