#!/usr/bin/env bash
# Solo se ejecuta al inicializar un data/ vacío: pgvector en la BD principal y BDs para LiteLLM
# y Hindsight (hindsight/start.sh también crea la suya si falta).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE litellm;
CREATE DATABASE hindsight;
EOSQL
