# genai-local-stack

Entorno local para trabajar con GenAI. Reúne:

- **LiteLLM** como gateway de modelos;
- **JupyterLab** y **opencode** como clientes;
- **Postgres** con pgvector;
- **otel-lgtm** (Grafana + Prometheus + Tempo + Loki + Pyroscope) como backend de OpenTelemetry;
- **Hindsight** como memoria a largo plazo para opencode y los notebooks.

Cada servicio se instala y configura de forma aislada dentro de su carpeta: nada se instala globalmente ni se mezcla con tu `~/.config`.

Este README es la guía rápida. La documentación técnica (arquitectura, cada servicio y sus integraciones) está en **[documentation/](documentation/README.md)**.

## Requisitos

- [uv](https://docs.astral.sh/uv/) (descarga Python 3.14 si no lo tienes)
- Node.js ≥ 20 con npm (y **Node 24** vía nvm para OpenChamber)
- Docker con Compose v2 (para Postgres y otel-lgtm; sin Docker, `setup.sh` los omite)
- bash

## Puesta en marcha

```bash
git clone <url> genai-local-stack && cd genai-local-stack
./setup.sh
```

`setup.sh` instala todos los servicios, crea tus configs locales a partir de las plantillas y conecta los servicios entre sí:
- genera la master key de LiteLLM y la password de Postgres;
- rellena en cada servicio las claves, `DATABASE_URL`, el endpoint OTLP y las URLs de LiteLLM y Hindsight.

Es idempotente: solo rellena valores vacíos y, si una plantilla gana variables nuevas, las añade a tu `.env` sin tocar las existentes. Para desactivar una conexión, comenta la variable (`#DATABASE_URL=...`) y `setup.sh` la respetará.

Después:
1. Copia tu clave de OpenCode Go en `OPENCODE_GO_API_KEY` dentro de `apps-data-and-config/litellm/config/.env`. Se obtiene en https://opencode.ai/console (OpenCode Go → API key).
2. Los modelos del catálogo (`go-<id>`) ya están en `litellm/config/config.yaml`; opencode los descubre solo, sin declararlos en su config (ver [LiteLLM](documentation/servicios/litellm.md) y [opencode ↔ LiteLLM](documentation/integraciones/opencode-litellm.md)).

## Launcher

```bash
./launcher.sh      # abre http://127.0.0.1:8765
```

Desde el launcher puedes:
- arrancar el core (Postgres, otel-lgtm y LiteLLM);
- abrir opencode, con o sin memoria;
- abrir OpenChamber, la interfaz web/PWA de opencode;
- arrancar y parar Hindsight y JupyterLab;
- ver los logs de cada servicio.

Ctrl+C para todo lo que arrancó. Detalles: [documentation/servicios/launcher.md](documentation/servicios/launcher.md).

## Arranque manual

Cada servicio se puede arrancar también con su `start.sh`. Orden: Postgres y otel-lgtm → LiteLLM → Hindsight → el resto.

| Servicio | Comando | URL |
|---|---|---|
| Postgres | `apps-data-and-config/postgres/start.sh` | `127.0.0.1:15432` |
| otel-lgtm | `apps-data-and-config/otel-lgtm/start.sh` | Grafana http://127.0.0.1:3000 · OTLP http://127.0.0.1:4318 (HTTP) y :4317 (gRPC) |
| LiteLLM | `apps-data-and-config/litellm/start.sh` | http://127.0.0.1:4000 (UI en `/ui`) |
| Hindsight | `apps-data-and-config/hindsight/start.sh` | API http://127.0.0.1:8890 · UI http://127.0.0.1:9999 |
| JupyterLab | `apps-data-and-config/jupyterlab/start.sh` | http://127.0.0.1:8888 (token en la salida) |
| opencode | `apps-data-and-config/opencode/start.sh` | TUI |
| OpenChamber | `apps-data-and-config/openchamber/start.sh` | http://127.0.0.1:3010 (contraseña en su `config/.env`) |

- **Postgres y otel-lgtm** corren en segundo plano con Docker y se paran con su `stop.sh`. Los datos se conservan.
- **El resto** corre en primer plano. El servidor de fondo de opencode se para con `opencode/start.sh service stop`.
- **JupyterLab y opencode** trabajan siempre sobre `workspace/`.
- **Argumentos extra** de cada `start.sh` se pasan a la aplicación, p. ej. `opencode/start.sh mi-proyecto` (relativo a `workspace/`), `opencode/start.sh run "..."` o `jupyterlab/start.sh --no-browser`.

## Estructura

```
apps-data-and-config/
├── <servicio>/          postgres, otel-lgtm, litellm, hindsight, jupyterlab, launcher
│   ├── app/             instalación: pyproject.toml + uv.lock (.venv), package.json + package-lock.json
│   │                    (node_modules) o compose.yaml con la imagen fijada (Docker)
│   ├── config/          plantillas *.example* (versionadas) y tu config real (local)
│   ├── data/            estado generado: sesiones, credenciales, BD, telemetría, logs, caché (local)
│   ├── install.sh       instala desde el lockfile/imagen fijada y crea la config que falte desde las plantillas
│   ├── update.sh        sube a la última versión y regenera el lockfile (o el tag de la imagen)
│   ├── start.sh         arranca el servicio aislado
│   ├── stop.sh          (Docker) para el contenedor
│   └── compose.sh       (Docker) docker compose con la config del servicio: ./compose.sh ps | logs -f | exec …
└── opencode-plugins/   plugins propios de opencode
templates/               plantillas que setup.sh copia al workspace/ (README)
documentation/           documentación técnica del stack
workspace/               tu directorio de trabajo: un repo git propio que crea setup.sh (este repo no lo versiona)
```

**Qué se versiona y qué es local.** En git solo están la estructura, los scripts, las definiciones de instalación con sus lockfiles, los plugins propios y las plantillas (`config.example.yaml`, `opencode.example.jsonc`, `.env.example`…). `install.sh` copia cada plantilla a su nombre real (`config.yaml`, `opencode.jsonc`, `.env`…) solo si no existe. Esos ficheros, `data/` y `workspace/` están en `.gitignore`. Si un cambio de config debe llegar a otros usuarios, aplícalo también en la plantilla.

## Puertos

Todos los puertos se configuran en el `config/.env` de cada servicio, y los de Docker se publican solo en `127.0.0.1`:

| Variable | Por defecto |
|---|---|
| `POSTGRES_PORT` | 15432 (no el 5432, para no chocar con otros Postgres) |
| `LGTM_GRAFANA_PORT`, `LGTM_OTLP_HTTP_PORT`, `LGTM_OTLP_GRPC_PORT` | 3000, 4318, 4317 |
| `LGTM_PROMETHEUS_PORT`, `LGTM_TEMPO_PORT`, `LGTM_PYROSCOPE_PORT` | 9090, 3200, 4040 |
| `LITELLM_PORT`, `JUPYTER_PORT`, `OPENCODE_SERVICE_PORT` | 4000, 8888, 49380 |
| `HINDSIGHT_API_PORT`, `HINDSIGHT_CP_PORT` | 8890 (el 8888 por defecto de Hindsight lo usa JupyterLab), 9999 |
| `LAUNCHER_PORT` (en `launcher/config/.env`) | 8765 |
| `OPENCHAMBER_PORT` (en `openchamber/config/.env`) | 3010 |

Si cambias un puerto, reinicia el servicio y actualiza las variables que apuntan a él. Para la mayoría basta con vaciarlas y volver a ejecutar `setup.sh`:

| Puerto | Variables a actualizar | Cómo |
|---|---|---|
| Postgres u otel-lgtm (reinicia con `stop.sh` + `start.sh`) | `DATABASE_URL` y `OTEL_EXPORTER_OTLP_ENDPOINT` en LiteLLM y JupyterLab; `HINDSIGHT_API_DATABASE_URL` y `HINDSIGHT_API_OTEL_EXPORTER_OTLP_ENDPOINT` en Hindsight | Vacíalas y relanza `setup.sh` |
| `LITELLM_PORT` | `LITELLM_BASE_URL` en opencode y `HINDSIGHT_API_LLM_BASE_URL` en Hindsight | Vacíalas y relanza `setup.sh` |
| `LITELLM_PORT` | `OPENAI_BASE_URL` en JupyterLab | A mano |
| `HINDSIGHT_API_PORT` | `HINDSIGHT_API_URL` en JupyterLab y opencode | Vacíalas y relanza `setup.sh` |

## Actualizar versiones

```bash
apps-data-and-config/<servicio>/update.sh                    # p. ej. litellm/update.sh, opencode/update.sh
apps-data-and-config/opencode-plugins/update.sh              # tras actualizar opencode: alinea los plugins propios
```

Cada `update.sh` actualiza a la última versión publicada y regenera el lockfile. En los servicios Docker actualiza el tag fijado en `app/compose.yaml`; Postgres no cambia de versión mayor, porque requiere dump/restore. Haz commit de `uv.lock`, `package.json`/`package-lock.json` o `compose.yaml` para que el resto de clones instalen la misma versión.

## Documentación

- [Introducción y arquitectura](documentation/README.md)
- **Servicios**:
  - [Launcher](documentation/servicios/launcher.md)
  - [LiteLLM](documentation/servicios/litellm.md)
  - [Postgres](documentation/servicios/postgres.md)
  - [otel-lgtm](documentation/servicios/otel-lgtm.md)
  - [Hindsight](documentation/servicios/hindsight.md)
  - [JupyterLab](documentation/servicios/jupyterlab.md)
  - [opencode](documentation/servicios/opencode.md)
- **Integraciones**:
  - [opencode ↔ LiteLLM](documentation/integraciones/opencode-litellm.md)
  - [opencode ↔ Hindsight](documentation/integraciones/opencode-hindsight.md)
  - [Observabilidad](documentation/integraciones/observabilidad.md)
- [Referencias](documentation/referencias.md), incluida la lista [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) del ecosistema de opencode.
