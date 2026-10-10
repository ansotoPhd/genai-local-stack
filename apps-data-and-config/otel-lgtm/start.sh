#!/usr/bin/env bash
# Arranca otel-lgtm en segundo plano y espera a que esté listo. Argumentos extra se pasan a `up`.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SVC/compose.sh" up -d --wait "$@"
set -a; source "$SVC/config/.env"; set +a
echo "Grafana:   http://127.0.0.1:${LGTM_GRAFANA_PORT:-3000}"
echo "OTLP HTTP: http://127.0.0.1:${LGTM_OTLP_HTTP_PORT:-4318}"
echo "OTLP gRPC: http://127.0.0.1:${LGTM_OTLP_GRPC_PORT:-4317}"
