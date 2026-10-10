#!/usr/bin/env bash
# Arranca el launcher web del stack (atajo de apps-data-and-config/launcher/start.sh).
# Ctrl+C lo cierra y para todo lo que arrancó.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$ROOT/apps-data-and-config/launcher/start.sh" "$@"
