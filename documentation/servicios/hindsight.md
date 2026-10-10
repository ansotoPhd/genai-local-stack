# Hindsight

[Hindsight](https://hindsight.vectorize.io) es una memoria a largo plazo para agentes. Tiene tres operaciones:
- `retain`: extrae hechos de lo que se le da;
- `recall`: los recupera por significado;
- `reflect`: razona sobre ellos.

Está en `apps-data-and-config/hindsight/`. Corre en nativo: la API con uv (`hindsight-api-slim`) y su UI (control plane) desde npm. `start.sh` lanza ambas y Ctrl+C las para.

| | |
|---|---|
| API | http://127.0.0.1:8890 (`HINDSIGHT_API_PORT`; el 8888 por defecto lo usa JupyterLab) |
| UI | http://127.0.0.1:9999 (`HINDSIGHT_CP_PORT`) |
| BD | `hindsight` en el Postgres del stack (`start.sh` la crea si falta y aplica las migraciones) |
| LLM | LiteLLM, modelo `go-deepseek-v4.1-flash` (`HINDSIGHT_API_LLM_MODEL`) |
| Embeddings | `intfloat/multilingual-e5-small` en ONNX, local y en CPU |
| Reranking | Fusión RRF, sin modelo |
| Trazas | otel-lgtm, servicio `hindsight-api` |

## Notas

- **LLM**: sin la clave de OpenAI en LiteLLM (o con otro modelo inexistente), `recall` funciona, pero `retain` y `reflect` no pueden extraer ni razonar.
- **Embeddings**: el modelo se descarga la primera vez (~470 MB) en `hindsight/data/hf`. La dimensión de los embeddings queda fijada en la BD, así que cambiar de modelo obliga a reindexar.

## Bancos

Cada cliente escribe en sus propios bancos:

| Cliente | Banco |
|---|---|
| opencode | `opencode::<repo>` |
| JupyterLab | `jupyterlab` (`HINDSIGHT_BANK_ID`) |

`<repo>` es el nombre del repo git en el que se trabaja. Cómo lo usa opencode: [opencode ↔ Hindsight](../integraciones/opencode-hindsight.md). Cómo usarlo desde un notebook: [JupyterLab](jupyterlab.md).
