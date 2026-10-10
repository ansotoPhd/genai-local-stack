# AGENTS.md

Guía para agentes (y personas) que trabajen en este repositorio.

## Qué es

Stack local de GenAI: LiteLLM como gateway de modelos, opencode y JupyterLab como clientes, Postgres con pgvector, Hindsight como memoria y otel-lgtm para observabilidad. Cada servicio se instala y guarda su estado en su propia carpeta; nada se instala globalmente.

## Estructura

```
apps-data-and-config/
├── <servicio>/        app/ (lockfiles), config/ (plantillas y config local), data/ (estado)
│                      install.sh, update.sh, start.sh
├── opencode-plugins/  plugins propios de opencode (sin dependencias de ejecución)
documentation/         documentación técnica de servicios e integraciones
workspace/             directorio de trabajo de opencode y JupyterLab (repo git aparte, no versionado)
```

## Puesta en marcha

```bash
./setup.sh        # instala todo y conecta los servicios (idempotente)
./launcher.sh     # interfaz web en http://127.0.0.1:8765
apps-data-and-config/<servicio>/start.sh   # arranque manual de un servicio
```

## Convenciones

- **Plantillas y config local**: solo se versionan `*.example*`. La config real (`.env`, `opencode.jsonc`, `config.yaml`…) y `data/` son locales y están en `.gitignore`. Si un cambio debe llegar a otros, aplícalo en la plantilla.
- **Versiones fijadas**: `uv.lock`, `package-lock.json` o el tag de la imagen. Se suben con el `update.sh` del servicio, no a mano.
- **Nada global**: no escribir en `~/.config` ni `~/.local`; cada servicio redirige su estado a su `data/`.
- **`workspace/` es otro repo**: no lo versiones aquí ni lo mezcles con el stack.
- **Idioma**: documentación, comentarios y mensajes de commit en español.

## Documentación y comprobaciones

- Detalle de cada pieza: `documentation/` (índice en `documentation/README.md`).
- Plugin de modelos: `cd apps-data-and-config/opencode-plugins/opencode-litellm-provider && npm test && npm run typecheck`.
- opencode: `apps-data-and-config/opencode/start.sh --version` y `apps-data-and-config/opencode/start.sh models`.
- LiteLLM: `apps-data-and-config/litellm/start.sh` (UI en http://127.0.0.1:4000/ui).
