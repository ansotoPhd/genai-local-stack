# otel-lgtm

Backend OpenTelemetry todo en uno de Grafana ([docker-otel-lgtm](https://github.com/grafana/docker-otel-lgtm)), pensado para desarrollo. Está en `apps-data-and-config/otel-lgtm/` y corre en Docker. Incluye:

| Componente | Para qué | Puerto |
|---|---|---|
| OTel Collector | Recibe OTLP | 4318 (HTTP), 4317 (gRPC) |
| Grafana | Visualización (acceso anónimo como admin) | 3000 |
| Tempo | Trazas | 3200 |
| Prometheus | Métricas | 9090 |
| Loki | Logs | — |
| Pyroscope | Perfiles | 4040 |

Todos los puertos se publican solo en `127.0.0.1` y se configuran en `otel-lgtm/config/.env`.

## Datos

Métricas, trazas, logs y dashboards se guardan en el volumen Docker `genai-otel-lgtm_lgtm-data`, no en `data/`. El contenedor corre como root, que es lo que necesita Grafana para instalar sus plugins de datasource. Los datos se conservan al parar; `otel-lgtm/stop.sh -v` (o «Borrar datos» en el launcher) los borra.

## Uso

En Grafana, **Drilldown** es la forma más rápida de explorar. Las trazas aparecen unos 20–30 s después de producirse. **Traces** y **Metrics** se llenan con lo que envían LiteLLM y Hindsight. **Logs** recibe los eventos de error de LiteLLM; **Profiles** queda vacío mientras nadie envíe perfiles.

Qué envía cada servicio: [Observabilidad](../integraciones/observabilidad.md).
