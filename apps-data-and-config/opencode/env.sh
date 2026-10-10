# Variables de aislamiento de opencode (lo cargan start.sh, install.sh y update.sh; requiere $SVC).
# Redirigen config a config/ y todo el estado (credenciales, sesiones, logs, caché) a data/.

# Rutas XDG del host, antes de redirigirlas: host-env.sh las restaura en los comandos del agente.
export GENAI_HOST_XDG_DATA_HOME="${GENAI_HOST_XDG_DATA_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}}"
export GENAI_HOST_XDG_STATE_HOME="${GENAI_HOST_XDG_STATE_HOME:-${XDG_STATE_HOME:-$HOME/.local/state}}"
export GENAI_HOST_XDG_CACHE_HOME="${GENAI_HOST_XDG_CACHE_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}}"
export GENAI_HOST_XDG_CONFIG_HOME="${GENAI_HOST_XDG_CONFIG_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}}"

export XDG_DATA_HOME="$SVC/data/share"
export XDG_STATE_HOME="$SVC/data/state"
export XDG_CACHE_HOME="$SVC/data/cache"
export XDG_CONFIG_HOME="$SVC/data/xdg-config"

export OPENCODE_CONFIG_DIR="$SVC/config"
# "Home" de opencode = workspace/: el selector de "Añadir proyecto" solo ofrece carpetas de ahí.
# (Variable de opencode pensada para tests; también evita que lea ~/.claude.)
export OPENCODE_TEST_HOME="$(cd "$SVC/../.." && pwd)/workspace"
export OPENCODE_DISABLE_AUTOUPDATE=1

# Plugin de Hindsight: su config en config/ y sus logs en data/ (por defecto, en ~/.hindsight).
export HINDSIGHT_CONFIG="$SVC/config/hindsight.json"
export HINDSIGHT_LOG_FILE="$SVC/data/hindsight/coding-agents.log"
export HINDSIGHT_DIAG_FILE="$SVC/data/hindsight/diag.log"
export HINDSIGHT_USAGE_FILE="$SVC/data/hindsight/usage.jsonl"
