# JupyterLab

JupyterLab sobre `workspace/`, en http://127.0.0.1:8888 (`JUPYTER_PORT`; la URL con token aparece en la salida y en el launcher). Está en `apps-data-and-config/jupyterlab/`.

El kernel por defecto usa el mismo entorno de `jupyterlab/app`, que ya incluye `openai`, `psycopg` + `pgvector`, el SDK de OpenTelemetry y el cliente de Hindsight. Para añadir librerías:

```bash
uv add --project apps-data-and-config/jupyterlab/app <paquete>
```

## Conexión con el stack

Las variables de `jupyterlab/config/.env` llegan a los notebooks:

| Variable | Apunta a |
|---|---|
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | LiteLLM (la clave la rellena `setup.sh`) |
| `DATABASE_URL` | BD `genai` del Postgres del stack |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | otel-lgtm, servicio `jupyterlab` |
| `HINDSIGHT_API_URL`, `HINDSIGHT_BANK_ID` | Hindsight, banco `jupyterlab` |

```python
from openai import OpenAI
client = OpenAI()                         # OPENAI_BASE_URL / OPENAI_API_KEY → LiteLLM
client.chat.completions.create(model="go-gpt-6-luna", messages=[{"role": "user", "content": "Hola"}])

import os, psycopg
from pgvector.psycopg import register_vector
conn = psycopg.connect(os.environ["DATABASE_URL"])   # BD genai
register_vector(conn)

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
provider = TracerProvider()               # servicio "jupyterlab" (OTEL_SERVICE_NAME)
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))  # → otel-lgtm
trace.set_tracer_provider(provider)

from hindsight_client import Hindsight
memory = Hindsight(base_url=os.environ["HINDSIGHT_API_URL"])
bank = os.environ["HINDSIGHT_BANK_ID"]                # "jupyterlab"
memory.create_bank(bank_id=bank)                      # idempotente; sin banco, recall da 404
memory.retain(bank_id=bank, content="Prefiero respuestas en español")
memory.recall(bank_id=bank, query="¿En qué idioma respondo?")
```
