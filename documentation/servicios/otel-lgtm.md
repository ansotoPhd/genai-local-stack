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

Métricas, trazas, logs y dashboards se guardan en `otel-lgtm/data/`. El contenedor corre con tu usuario, como Postgres, así que esos ficheros son tuyos. Además tiene el grupo 0 como grupo secundario (`group_add`): Grafana actualiza al arrancar sus plugins de datasource borrando antes su carpeta, que en la imagen (desde la 0.39) solo pueden modificar el propietario y el grupo 0; sin ese grupo perdería Prometheus, Loki, Tempo y Pyroscope. Los datos se conservan al parar; `otel-lgtm/stop.sh -v` (o «Borrar datos» en el launcher) vacía `data/`.

## Uso

En Grafana, **Drilldown** es la forma más rápida de explorar. Las trazas aparecen unos 20–30 s después de producirse. **Traces** y **Metrics** se llenan con lo que envían LiteLLM y Hindsight. **Logs** recibe los eventos de error de LiteLLM; **Profiles** queda vacío mientras nadie envíe perfiles.

Qué envía cada servicio: [Observabilidad](../integraciones/observabilidad.md).
