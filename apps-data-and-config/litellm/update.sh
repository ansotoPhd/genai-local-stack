#!/usr/bin/env bash
# Actualiza LiteLLM y sus dependencias a la última versión compatible (regenera uv.lock y el cliente Prisma).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv lock --project "$SVC/app" --upgrade
"$SVC/install.sh"
"$SVC/app/.venv/bin/litellm" --version
