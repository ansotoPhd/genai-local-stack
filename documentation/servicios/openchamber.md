# OpenChamber

[OpenChamber](https://github.com/openchamber/openchamber) es un cliente alternativo para opencode: **web/PWA**, escritorio y VS Code. Sustituye a la interfaz web nativa de opencode, que se queda corta, con diffs, terminal integrada, revisión de cambios, sesiones y acceso desde el móvil. Licencia MIT.

Se instala en `apps-data-and-config/openchamber/` con el patrón habitual del stack: `app/` (el paquete npm), `config/` (su `.env`) y `data/` (estado propio).

## Qué aporta

- Vista de cambios y diffs por sesión, con revisión y comentarios.
- Terminal integrada y reenganche a un terminal que sigue corriendo.
- PWA instalable, con notificaciones y uso desde el móvil (también hay APK de Android).
- Varios proyectos y sesiones a la vez, y conexión remota por SSH o túnel.

## Cómo se conecta con el stack

No usa el servidor de opencode del launcher: **lanza su propia instancia**, en un puerto efímero, a través de `bin/opencode`. Ese envoltorio carga `opencode/config/.env` y `opencode/env.sh`, así que esa instancia:

- usa la configuración de `opencode/config/` (provider `local_litellm` y plugins),
- guarda sesiones y credenciales en `opencode/data/` (incluida la cuenta de OpenCode Go conectada),
- habla con LiteLLM igual que la TUI.

El estado propio de OpenChamber (JWT, preferencias, chats, túneles) queda en `data/openchamber/`, y sus XDG apuntan a `data/`, no a tu `~/.config`.

```bash
# Comprobación rápida: el servidor gestionado hereda el aislamiento
curl -s http://127.0.0.1:3010/health | jq '{openCodeRunning, openCodePort, isOpenCodeReady}'
```

## Proyecto por defecto

OpenChamber solo usa `workspace/` si tiene un **proyecto activo**. Sin él, una sesión nueva se crea en
`data/openchamber/chats/<fecha>/session-<uuid>/` y el agente ejecuta ahí sus comandos (`pwd` lo delata).

`install.sh` registra el directorio de `OPENCHAMBER_OPENCODE_CWD` (por defecto `<repo>/workspace`) con
`register-project.py`, que es idempotente y no pisa el proyecto que hayas elegido tú. Si alguna sesión
antigua sigue apuntando a `chats/`, abre una nueva: las nuevas ya usan el proyecto.

## Arranque

```bash
apps-data-and-config/openchamber/start.sh   # http://127.0.0.1:3010
```

También desde el launcher, con su tarjeta **OpenChamber** (arranca LiteLLM antes si hace falta).

## Configuración

| Variable | Para qué | Por defecto |
|---|---|---|
| `OPENCHAMBER_PORT` | Puerto de la interfaz (3000 lo ocupa Grafana) | 3010 |
| `OPENCHAMBER_UI_PASSWORD` | Contraseña de la UI; `install.sh` la genera si está vacía. Se pasa por entorno, no en la línea de comandos | — |
| `OPENCHAMBER_UI_SESSION_TTL_HOURS` | Duración de la sesión del navegador | 12 |
| `OPENCHAMBER_OPENCODE_CWD` | Directorio donde arranca el opencode gestionado, es decir, el proyecto que abre por defecto | `<repo>/workspace` |

## Requisitos y actualización

Necesita **Node ≥ 24.14** (`nvm install 24`); `install.sh` y `update.sh` localizan esa versión y no tocan el Node del sistema.

```bash
apps-data-and-config/openchamber/update.sh   # última versión publicada
```

La versión está fijada en `app/package.json` y `app/package-lock.json`.
