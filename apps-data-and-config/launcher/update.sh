#!/usr/bin/env bash
# Actualiza las dependencias del launcher a la última versión compatible (regenera uv.lock).
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uv lock --project "$SVC/app" --upgrade
"$SVC/install.sh"
