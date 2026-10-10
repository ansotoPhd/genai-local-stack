# opencode ↔ LiteLLM: descubrimiento dinámico de modelos

opencode usa LiteLLM como un provider compatible con OpenAI (`local_litellm`). El plugin propio **opencode-litellm-provider** (`apps-data-and-config/opencode-plugins/opencode-litellm-provider/`) descubre los modelos de LiteLLM y los registra en opencode con sus metadatos.

## Por qué

Sin el plugin, cada modelo tenía que declararse a mano en el bloque `models` de la config de opencode. Eso suponía:

- **Mantenimiento manual**: cada alta, baja o cambio de nombre en LiteLLM (en `config.yaml` o desde la UI) obligaba a editar la config de opencode y reiniciar.
- **Modelos sin metadatos**: con solo `name`, opencode aplicaba valores por defecto. Contexto y salida genéricos (así la compactación automática no sabe cuándo actuar), sin precios, sin saber si el modelo acepta imágenes o PDF y sin las variantes de razonamiento (`reasoning_effort`) que admite cada modelo.
- **URL fija**: la URL de LiteLLM iba escrita en la config.

LiteLLM ya conoce todo eso: `/v1/model/info` devuelve, para cada modelo, los límites, las capacidades, los precios y los niveles de razonamiento, ya sea de su mapa interno de modelos o de lo declarado en `model_info`. El plugin lo traslada a opencode.

## Configuración

En la config de opencode (la plantilla ya lo trae):

```jsonc
// config/opencode.jsonc
"plugin": ["../app/node_modules/@vectorize-io/hindsight-coding-agents", "../../opencode-plugins/opencode-litellm-provider"],
"providers": {
  "local_litellm": {
    "name": "Local LiteLLM",
    "package": "@opencode/ai/providers/openai-compatible",
    "env": ["LITELLM_API_KEY"],
    "settings": { "litellm": true }
  }
}
```

| Qué | De dónde |
|---|---|
| Provider que gestiona el plugin | El que tenga `litellm: true` en sus `settings` |
| URL de LiteLLM | `settings.baseURL` del provider o, si no hay, `LITELLM_BASE_URL` (en `config/.env`, la rellena `setup.sh` desde `LITELLM_PORT`) |
| Clave | `settings.apiKey` o `LITELLM_API_KEY` (en `config/.env`, `setup.sh` copia la master key; puede ser una virtual key) |

En LiteLLM, cada modelo puede llevar un nombre legible en `model_info.display_name` (clave propia del stack que LiteLLM devuelve tal cual):

```yaml
- model_name: go-gpt-6-luna
  litellm_params: { model: openai/gpt-6-luna, litellm_credential_name: opencode_go }
  model_info:
    display_name: "GPT-6 Luna (OpenCode Go)"
```

## Cómo funciona

1. **Consulta** `GET /v1/models` (los modelos a los que tiene acceso la clave) y `GET /v1/model/info` (metadatos por deployment, que se indexan por `model_name`, `model_info.key` y `litellm_params.model`). Si `/v1/model/info` falla, los modelos se registran sin metadatos.
2. **Filtra**: descarta los modelos que no son de chat (`mode` distinto de `chat`, `completion` o `responses`, como embeddings, imagen, audio o rerank; si no hay `mode`, decide por el nombre) y las reglas comodín (`proveedor/*`).
3. **Convierte** cada modelo al formato de opencode (tabla siguiente).
4. **Fusiona** con lo declarado a mano en `models`, que tiene prioridad campo a campo.
5. **Guarda** la lista en caché (`$XDG_CACHE_HOME/opencode-litellm-provider/`, que en el stack cae en `opencode/data/cache`). Si en otro arranque LiteLLM no responde (timeout de 8 s por petición), se usa la última lista guardada y se avisa en el log.

### Mapeo de campos

| LiteLLM (`model_info`) | opencode |
|---|---|
| `display_name` (o el `model_name`) | `name` |
| `max_input_tokens`, `max_output_tokens` | `limit` (sin datos: 200 000 / 32 000) |
| `supports_function_calling` | `capabilities.tools` |
| `supports_vision`, `supports_pdf_input`, `supports_audio_input` | `capabilities.input` (`image`, `pdf`, `audio`) |
| niveles de `reasoning_effort` (ver abajo) | `variants[].settings.reasoningEffort` |
| `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`, `cache_creation_input_token_cost` | `cost[]` (USD por millón de tokens) |

Las modalidades de entrada se declaran siempre, con solo `text` si LiteLLM no informa de nada más. Si se omitieran, opencode supondría que un modelo desconocido acepta imágenes. El precio solo se declara si LiteLLM lo conoce: omitirlo no es lo mismo que decir que es gratis.

### Variantes de razonamiento

Los niveles que admite cada modelo se deducen de su `model_info`, con estas reglas en orden:

1. `supports_reasoning: false` → ninguno.
2. Si hay una lista explícita (`reasoning_effort_levels`), esa manda.
3. Si `supported_openai_params` no incluye `reasoning_effort` (ni `reasoning`), ninguno.
4. Si no, se parte de `low`, `medium` y `high` (salvo que un flag `supports_<nivel>_reasoning_effort` sea `false`) y se añaden los opcionales con flag `true` (`none`, `minimal`, `xhigh`, `max`…).
5. Algunos modelos tienen restricciones conocidas (`gpt-5-pro`: solo `high`; `gpt-5.2-pro` y `gpt-5.4-pro`: `medium`, `high`, `xhigh`).

Cada nivel se convierte en una variante del modelo en opencode, que envía `reasoning_effort` a LiteLLM; LiteLLM lo traduce para cada proveedor (p. ej. a *thinking* en Claude). opencode no añade niveles por su cuenta: si LiteLLM indica razonamiento pero no los niveles, el plugin declara `low`/`medium`/`high`. `drop_params: true` en LiteLLM descarta el parámetro si al final el modelo no lo admite.

### Cómo se integra en opencode

El plugin usa la API de contexto de opencode:

1. Registra un `provider.transform`. Los providers de la config pueden no existir todavía cuando se aplican las transformaciones de los plugins: el plugin registra `local_litellm` (`editor.add`) con los modelos descubiertos y después opencode aplica la config encima, campo a campo.
2. Escucha `provider.updated` para localizar el provider de la config (se registra después del `setup` del plugin).
3. En cada `session.created` vuelve a consultar LiteLLM (como mucho una vez por minuto) y, si la lista cambió, llama a `provider.reload()`. **Un modelo nuevo en LiteLLM aparece en la sesión siguiente sin reiniciar.**

- Logs: opencode no ofrece una API de log a los plugins y la consola de su servidor de fondo no se guarda, así que el plugin escribe en `opencode/data/state/opencode-litellm-provider/plugin.log`.

### Exportación

`index.js` reexporta `src/index.ts`, cuyo `default` es `{ id, setup }`. opencode carga `<dir>/index.js` y llama a `setup()`. Bun importa TypeScript directamente, así que no hay paso de compilación. Los tipos de opencode (`@opencode/plugin`) solo se usan al desarrollar: el plugin no tiene dependencias de ejecución.

## Ajustes a mano

Lo declarado en `models` se aplica encima de lo descubierto, campo a campo:

```jsonc
"models": {
  "go-gpt-6-luna": { "name": "Luna", "limit": { "context": 400000 } },  // el resto viene de LiteLLM
  "otro-modelo": { "name": "Solo en la config" }                            // se respeta tal cual
}
```

Es útil para corregir un dato concreto. Si el dato es incorrecto para todos los clientes, mejor corregirlo en `model_info` de LiteLLM.

## Añadir un modelo

1. Añádelo a `model_list` en `litellm/config/config.yaml` y reinicia LiteLLM, o añádelo desde la UI de LiteLLM (`STORE_MODEL_IN_DB=True`, sin reiniciar).
2. Si LiteLLM no conoce el modelo (p. ej. uno nuevo de OpenRouter), declara en `model_info` su contexto, sus capacidades y su precio:

   ```yaml
   model_info:
     display_name: "GPT-OSS 120B (OpenRouter)"
     max_input_tokens: 131072
     max_output_tokens: 117964
     supports_function_calling: true
     supports_reasoning: true
     input_cost_per_token: 3.7e-08
     output_cost_per_token: 1.7e-07
   ```

3. opencode lo verá en la siguiente sesión.

Para comprobar qué ve opencode:

```bash
apps-data-and-config/opencode/start.sh models   # lista de modelos descubiertos
```

## Diagnóstico

| Síntoma | Causa probable |
|---|---|
| `local_litellm` sin modelos | LiteLLM no estaba en marcha la primera vez (no hay caché) o falla la clave. Mira el log del plugin. |
| Aviso "se usan los modelos guardados el …" | LiteLLM no respondió al arrancar opencode: arranca LiteLLM; se recupera en la siguiente sesión. |
| Modelo sin límites, imagen ni razonamiento | LiteLLM no lo conoce: declara su `model_info` (ver arriba). Compruébalo con `curl -H "Authorization: Bearer $KEY" http://127.0.0.1:4000/v1/model/info`. |
| Un modelo nuevo no aparece | Se consulta como mucho una vez por minuto: abre una sesión nueva. Si sigue sin aparecer, reinicia el servidor de fondo con `start.sh service restart`. |
| `"local_litellm" no tiene baseURL ni LITELLM_BASE_URL` | Falta `LITELLM_BASE_URL` en `config/.env`: ejecuta `./setup.sh` y reinicia el servidor de fondo. |

## Origen

El plugin es una copia ligera, adaptada al stack, de partes de [yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm) v1.4.2 (MIT, © 2026 Yusef Mohamadi). El detalle de qué se tomó y qué cambió está en el [README del plugin](../../apps-data-and-config/opencode-plugins/opencode-litellm-provider/README.md#origen). Otras opciones de la comunidad, para comparar o tomar ideas, están en [Referencias](../referencias.md).
