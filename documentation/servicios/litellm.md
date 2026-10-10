# LiteLLM

[LiteLLM](https://docs.litellm.ai/) es el gateway de modelos del stack: expone una API compatible con OpenAI en http://127.0.0.1:4000 y la traduce a cada proveedor. Los clientes del stack (opencode, JupyterLab, Hindsight) solo conocen LiteLLM y su clave, nunca las claves de los proveedores.

- Instalación: `apps-data-and-config/litellm/app` (`litellm[proxy]` con uv).
- Configuración: `litellm/config/config.yaml` (credenciales, modelos y ajustes) y `litellm/config/.env` (secretos y conexiones).

## Credenciales

El stack usa un único proveedor: **OpenCode Go**, una suscripción con catálogo propio de modelos de código. La plantilla declara una sola credencial en `credential_list`, que lee su clave del `.env`:

| Proveedor | Credencial | Variable del `.env` |
|---|---|---|
| OpenCode Go | `opencode_go` | `OPENCODE_GO_API_KEY` |

La clave se copia de https://opencode.ai/console (OpenCode Go → API key). Cada modelo la referencia con `litellm_credential_name`.

El gateway de Go no es un OpenAI-compatible genérico: exige un identificador estable de sesión en `x-opencode-session` y un `User-Agent` propio. Por eso cada modelo lleva `litellm_params.extra_headers` con los dos. El identificador es fijo para todo el stack (no es un secreto, pero conviene no reutilizarlo fuera).

Los 28 modelos del catálogo están en `model_list` con `model_name: go-<id>`. Su `model_info` (contexto, precio por token, visión/PDF, herramientas y niveles de razonamiento) se genera desde `https://opencode.ai/inference/go/v1/models`, que ya publica esos datos; no hay que mantenerlo a mano.

## Modelos

Cada entrada de `model_list` define un **model_name**: el nombre que usan los clientes. Sigue el patrón `<proveedor>-<id del fabricante>`: aquí `go-<id>` (p. ej. `go-gpt-6-luna`). `litellm_params.model` indica el modelo real del catálogo de Go.

```yaml
- model_name: go-gpt-6-luna
  litellm_params:
    model: openai/gpt-6-luna
    litellm_credential_name: opencode_go
    api_base: https://opencode.ai/inference/go/openai/v1
    extra_headers:
      x-opencode-session: <uuid fijo del stack>
      User-Agent: genai-local-stack/1.0
    drop_params: true
  model_info:
    display_name: "GPT-6 Luna (OpenCode Go)"
    max_input_tokens: 922000
    max_output_tokens: 128000
    input_cost_per_token: 1e-07
    output_cost_per_token: 5e-07
    supports_reasoning: true
    reasoning_effort_levels: [none, low, medium, high, xhigh, max]
```

`model_info` describe el modelo: límites, precio por token (el catálogo los da por millón), herramientas, visión/PDF y niveles de razonamiento. En Go se genera desde el catálogo porque LiteLLM no conoce estos `model_name`; sin `model_info`, el gasto se registraría como $0 y opencode mostraría límites por defecto.

**opencode descubre los modelos solo**, a partir de `/v1/models` y `/v1/model/info` (ver [opencode ↔ LiteLLM](../integraciones/opencode-litellm.md)). Al añadir, quitar o renombrar un modelo, opencode lo ve en la siguiente sesión (consulta LiteLLM como mucho una vez por minuto).

Lo que ve opencode de cada modelo (límites, herramientas, imagen/PDF, razonamiento, precio) sale de `model_info`. La clave propia `display_name` da el nombre que se muestra.

Por defecto, opencode y Hindsight usan `go-deepseek-v4.1-flash`. Si cambias de modelo, actualiza `model` en la config de opencode y `HINDSIGHT_API_LLM_MODEL` en la de Hindsight.

### Modelos desde la UI

Con BD, la UI (http://127.0.0.1:4000/ui, usuario `admin`, contraseña `LITELLM_MASTER_KEY`) también permite añadir modelos. `STORE_MODEL_IN_DB=True` (en el `.env`) los guarda en Postgres, junto a los de `config.yaml`. opencode los descubre igual que el resto.

## Base de datos

`DATABASE_URL` (BD `litellm` en el Postgres del stack) activa:
- la UI;
- las virtual keys;
- el registro de gasto;
- los modelos guardados en BD.

LiteLLM aplica las migraciones al arrancar, así que Postgres debe estar levantado (si no, `start.sh` avisa). Para usar LiteLLM sin BD, comenta `DATABASE_URL`.

`install.sh` genera el cliente Prisma dentro del venv y después ejecuta `prisma-types-stub.sh`, que sustituye el `types.py` generado por un stub. Ese fichero son cientos de miles de líneas de `TypedDict`s que solo sirven para tipado estático, y en Python 3.14 (PEP 649) importarlo cuesta ~50 s: más que el tiempo que el launcher espera a que LiteLLM abra el puerto. Con el stub, el arranque pasa de ~3 min a ~15 s. Si alguna vez ejecutas `prisma generate` a mano, vuelve a lanzar el stub.

## Ajustes

- `drop_params: true`: descarta los parámetros que el modelo de destino no admite en vez de fallar. Por ejemplo, un `reasoning_effort` enviado a un modelo sin razonamiento.
- `modify_params: true`: adapta parámetros incompatibles, p. ej. el tool calling hacia Claude.
- `callbacks: ["otel"]` + `LITELLM_OTEL_V2=true`: telemetría OpenTelemetry v2 (ver [Observabilidad](../integraciones/observabilidad.md)).

## Clientes y claves

`setup.sh` copia la master key del proxy a cada cliente (no la clave de Go, que solo conoce LiteLLM):
- `LITELLM_API_KEY` en opencode;
- `OPENAI_API_KEY` en JupyterLab;
- `HINDSIGHT_API_LLM_API_KEY` en Hindsight.

También rellena la URL de LiteLLM a partir de `LITELLM_PORT`: `LITELLM_BASE_URL` en opencode y `HINDSIGHT_API_LLM_BASE_URL` en Hindsight. JupyterLab la trae fija en su plantilla (`OPENAI_BASE_URL`). Para dar a un cliente permisos más limitados, crea una virtual key en la UI y ponla en su `.env`. Tanto `/v1/models` como `/v1/model/info` funcionan con virtual keys y solo devuelven los modelos a los que la clave tiene acceso.
