#!/usr/bin/env bash
# Arranca OpenChamber (web/PWA) en primer plano, con data/ y opencode aislados.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Node 24 es requisito del paquete (se instala con nvm; no se usa el node del sistema).
NODE24="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin 2>/dev/null | sort -V | tail -1)"
[[ -n "$NODE24" ]] || { echo "Falta Node 24. Instálalo con: nvm install 24" >&2; exit 1; }
[[ -x "$SVC/app/node_modules/.bin/openchamber" ]] || { echo "Falta la instalación. Ejecuta $SVC/install.sh" >&2; exit 1; }

set -a; source "$SVC/config/.env"; set +a
: "${OPENCHAMBER_UI_PASSWORD:?falta OPENCHAMBER_UI_PASSWORD en config/.env}"

# Estado propio de OpenChamber (XDG) y, para sus hijos, el opencode del stack vía bin/opencode.
export PATH="$NODE24:$SVC/bin:$PATH"
export OPENCHAMBER_DATA_DIR="$SVC/data/openchamber"
# Proyecto por defecto: el opencode gestionado arranca en el workspace/ del stack.
export OPENCHAMBER_OPENCODE_CWD="${OPENCHAMBER_OPENCODE_CWD:-$(cd "$SVC/../.." && pwd)/workspace}"
export XDG_DATA_HOME="$SVC/data/share"
export XDG_STATE_HOME="$SVC/data/state"
export XDG_CACHE_HOME="$SVC/data/cache"
export XDG_CONFIG_HOME="$SVC/data/xdg-config"

# La contraseña va por entorno, no en argv (así no aparece en ps).
exec "$SVC/app/node_modules/.bin/openchamber" serve --foreground \
  --host 127.0.0.1 --port "${OPENCHAMBER_PORT:-3010}"
