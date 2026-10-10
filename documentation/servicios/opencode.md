# opencode

[opencode](https://opencode.ai) es un agente de código para terminal y web. El stack lo instala aislado en `apps-data-and-config/opencode/`.

| | |
|---|---|
| Paquete npm | `@opencode/cli` |
| Config | `config/opencode.jsonc` |
| Ejecución | servidor de fondo + clientes (TUI, web) |
| Plugins | exportan `{ id, setup }` (API de contexto) |

Los plugins propios están en `apps-data-and-config/opencode-plugins/` (ver [opencode ↔ LiteLLM](../integraciones/opencode-litellm.md)).

## Modelos

opencode usa el provider `local_litellm`: LiteLLM a través de su API compatible con OpenAI. Sus modelos no se declaran en la config: los descubre el plugin [opencode-litellm-provider](../integraciones/opencode-litellm.md), con límites, capacidades, precios y variantes de razonamiento. El modelo por defecto de la plantilla es `local_litellm/go-deepseek-v4.1-flash`; si conectas la cuenta de OpenCode Go (ver abajo), puedes usar `opencode-go/deepseek-v4.1-flash` para ir directo al gateway.

### Cuenta de OpenCode Go (directa, opcional)

Además del provider `local_litellm`, opencode puede usar la suscripción OpenCode Go sin pasar por LiteLLM. La credencial se guarda en `data/share/opencode/auth.json` (local, no versionado):

```bash
apps-data-and-config/opencode/start.sh auth login opencode-go   # pega la API key cuando la pida
apps-data-and-config/opencode/start.sh auth list
```

Sus modelos aparecen como `opencode-go/<id>` en `start.sh models`. La ventaja es que opencode envía la sesión y el `User-Agent` que espera el gateway; a cambio, esas llamadas no pasan por LiteLLM, así que no cuentan en su gasto ni en sus trazas. Con la cuenta conectada, el modelo por defecto local es `opencode-go/deepseek-v4.1-flash`; sin ella, la plantilla usa `local_litellm/go-deepseek-v4.1-flash`.

## Aislamiento

Por defecto, opencode usaría rutas en `~/.config/opencode` y `~/.local/share/opencode`. `env.sh` las separa:

- `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` y `XDG_CONFIG_HOME` apuntan a `data/`. Ahí van credenciales, sesiones, logs y caché.
- `OPENCODE_CONFIG_DIR` apunta a `config/`.
- `OPENCODE_DISABLE_AUTOUPDATE=1`: la versión solo cambia con `update.sh`.

Para que los comandos que ejecuta el agente (`uv`, `git`, `gh`…) usen las rutas normales del usuario, `start.sh` define `BASH_ENV=host-env.sh`, que restaura las XDG originales en cada bash no interactivo. El terminal interactivo integrado no carga `BASH_ENV`, así que ahí sí se ven las rutas de `data/`.

## Limitado a `workspace/`

- `start.sh` arranca siempre desde `<repo>/workspace`. Es un repo git propio, así que opencode lo toma como raíz del proyecto en lugar del repo del stack (con sus `.env`).
- El permiso `external_directory` está en `deny`: el agente no puede leer ni escribir fuera del proyecto abierto.
- `OPENCODE_TEST_HOME=<repo>/workspace` hace que «Añadir proyecto» solo ofrezca carpetas de `workspace/`. Es una variable pensada para tests, así que podría cambiar en otras versiones.
- Para trabajar en otro repo, clónalo dentro de `workspace/`.

## Uso

```bash
apps-data-and-config/opencode/start.sh                  # TUI
apps-data-and-config/opencode/start.sh mi-proyecto      # carpeta relativa a workspace/
apps-data-and-config/opencode/start.sh models           # modelos descubiertos
apps-data-and-config/opencode/start.sh run "..."        # sin interfaz
```

Los argumentos extra se pasan a opencode. El launcher abre su interfaz web.

### Servidor de fondo

opencode arranca un servidor en segundo plano que usan sus clientes. Ese servidor conserva el entorno con el que se lanzó: tras cambiar `config/.env`, reinícialo con `opencode/start.sh service restart` (para pararlo: `service stop`). Usa el puerto `OPENCODE_SERVICE_PORT` (49380), no el 49374 por defecto, para no chocar con otras instalaciones. El puerto se guarda en `config/service.json` al ejecutar `install.sh`.

## Configuración

| Fichero | Contenido |
|---|---|
| `config/opencode.jsonc` | Modelo por defecto, plugins, permisos y provider `local_litellm` |
| `config/.env` | `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `HINDSIGHT_API_URL` y `OPENCODE_SERVICE_PORT`; los rellena `setup.sh` |
| `config/hindsight.json` | Config del plugin de memoria (ver [opencode ↔ Hindsight](../integraciones/opencode-hindsight.md)) |

Actualizar: `opencode/update.sh` sube opencode y el plugin de Hindsight a la última versión. Después, `opencode-plugins/update.sh` alinea los tipos de los plugins propios.
