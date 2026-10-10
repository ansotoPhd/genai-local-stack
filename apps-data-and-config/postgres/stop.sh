#!/usr/bin/env bash
# Para y elimina el contenedor de Postgres. Los datos se conservan en data/.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SVC/compose.sh" down "$@"
