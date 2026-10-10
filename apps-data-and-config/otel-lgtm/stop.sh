#!/usr/bin/env bash
# Para y elimina el contenedor de otel-lgtm. Los datos se conservan en su volumen Docker;
# con -v (./stop.sh -v) se borran también.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SVC/compose.sh" down "$@"
