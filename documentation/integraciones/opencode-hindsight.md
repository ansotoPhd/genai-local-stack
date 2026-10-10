# opencode ↔ Hindsight: memoria a largo plazo

opencode usa [Hindsight](../servicios/hindsight.md) como memoria persistente entre sesiones mediante el plugin oficial [`@vectorize-io/hindsight-coding-agents`](https://hindsight.vectorize.io/sdks/integrations/coding-agents). Se instala con opencode (`opencode/app/`, versión fijada en su `package-lock.json`) y se carga desde la config con una ruta relativa:

```jsonc
"plugin": ["../app/node_modules/@vectorize-io/hindsight-coding-agents", ...]
```

Es el mismo mecanismo que usa [opencode-litellm-provider](opencode-litellm.md).

## Qué hace

- Al empezar una sesión, recupera de Hindsight lo relevante y lo inyecta en el contexto.
- Guarda cada sesión en el banco (`retain`).
- Añade herramientas `hindsight_*` para que el agente consulte o guarde memoria cuando lo necesite.
- La primera vez en un repo, siembra el banco con sus mensajes de commit.

El análisis automático del código (`codebaseSurvey`) está desactivado porque lanzaría otro agente CLI.

## Bancos

Hay un banco por repo git: `bankIdTemplate` es `opencode::{gitProject}`.

- Lo que esté suelto en `workspace/`, que es un repo git propio, va a `opencode::workspace`.
- Cada proyecto con su propio git dentro de `workspace/` tiene su banco.

## Configuración

| Qué | Dónde |
|---|---|
| Config del plugin | `opencode/config/hindsight.json` (`HINDSIGHT_CONFIG`). Opciones: [documentación del plugin](https://hindsight.vectorize.io/sdks/integrations/coding-agents) |
| URL de la API | `HINDSIGHT_API_URL` en `opencode/config/.env` (la rellena `setup.sh`) |
| Logs del plugin | `opencode/data/hindsight/` (`HINDSIGHT_LOG_FILE`, `HINDSIGHT_DIAG_FILE`, `HINDSIGHT_USAGE_FILE`) |
| Activar o desactivar | `HINDSIGHT_DISABLED=true\|false`. El launcher lo fija en cada arranque según la opción de memoria |

Todas estas variables las define `env.sh`, salvo `HINDSIGHT_DISABLED`, que la pone el launcher.
