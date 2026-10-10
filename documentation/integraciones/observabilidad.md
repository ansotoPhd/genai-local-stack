# Observabilidad

Los servicios envían su telemetría por OTLP (HTTP, `http://127.0.0.1:4318`) a [otel-lgtm](../servicios/otel-lgtm.md) y se consulta en Grafana (http://127.0.0.1:3000). `setup.sh` rellena el endpoint en cada servicio (`OTEL_EXPORTER_OTLP_ENDPOINT`). Si otel-lgtm está parado, los servicios siguen funcionando sin telemetría.

| Servicio | Nombre (`service.name`) | Trazas | Métricas | Logs |
|---|---|---|---|---|
| LiteLLM | `litellm` | Sí | Sí | Eventos de error |
| Hindsight | `hindsight-api` | Sí | — | — |
| JupyterLab | `jupyterlab` | Lo que instrumentes en el notebook | — | — |

opencode no envía telemetría al stack. Sus llamadas a modelos quedan trazadas en LiteLLM.

## LiteLLM

Usa la integración OpenTelemetry **v2** de LiteLLM: `callbacks: ["otel"]` en `config.yaml` y `LITELLM_OTEL_V2=true` en `.env`, junto con el resto de `OTEL_*`/`LITELLM_OTEL_*`. Solo emite atributos de convenciones de OpenTelemetry:
- la semconv GenAI (`LITELLM_OTEL_LEGACY_COMPAT=false` quita los nombres heredados de Traceloop/semconv-ai);
- la HTTP estable (`OTEL_SEMCONV_STABILITY_OPT_IN=http,gen_ai_latest_experimental`).

LiteLLM añade siempre sus atributos `litellm.*` (coste, `call_id`…); la v2 no permite quitarlos.

- **Trazas** (Tempo): una por petición. El span HTTP raíz tiene como hijos:
  - `auth`;
  - `chat <modelo>` (CLIENT, con `gen_ai.*`, tokens y el contenido de los mensajes, por `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=span_and_event`);
  - los guardrails, si los configuras.

  La escritura del gasto en BD (`batch_write_to_db`) va en una traza aparte, porque ocurre después de responder.
- **Métricas** (Prometheus): `gen_ai_client_token_usage`, `gen_ai_client_operation_duration_seconds`, `gen_ai_usage_cost_USD`…
- **Logs** (Loki): el evento `gen_ai.client.operation.exception` de cada llamada fallida, enlazado a su traza.

Cada petición de opencode, de JupyterLab o del LLM de Hindsight aparece como una traza de LiteLLM con el modelo, los tokens y el coste.

## Hindsight

Trazas de su API (`HINDSIGHT_API_OTEL_TRACES_ENABLED=true`, servicio `hindsight-api`). Sus llamadas al LLM aparecen además como trazas de LiteLLM.

## JupyterLab

El entorno del kernel trae el SDK de OpenTelemetry y las variables `OTEL_*`. Basta con crear un `TracerProvider` con `OTLPSpanExporter()` para enviar trazas como servicio `jupyterlab` (ejemplo en [JupyterLab](../servicios/jupyterlab.md)).

## Dónde mirar

- **Grafana → Drilldown → Traces / Metrics**: las trazas aparecen unos 20–30 s después de producirse.
- **Explore**, con los datasources Tempo, Prometheus, Loki y Pyroscope ya configurados.
