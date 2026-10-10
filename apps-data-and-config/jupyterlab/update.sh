#!/usr/bin/env bash
# Actualiza JupyterLab y sus dependencias a la última versión compatible (regenera uv.lock).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv lock --project "$SVC/app" --upgrade
uv sync --project "$SVC/app" --locked
"$SVC/app/.venv/bin/jupyter" lab --version
