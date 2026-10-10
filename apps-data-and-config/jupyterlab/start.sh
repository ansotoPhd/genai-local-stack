#!/usr/bin/env bash
# Arranca JupyterLab aislado: config en config/, estado en data/, ficheros en <repo>/workspace.
# Argumentos extra se pasan a `jupyter lab`.
set -euo pipefail
SVC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in "$SVC/app/.venv/bin/jupyter" "$SVC/config/jupyter_server_config.py" "$SVC/config/.env"; do
  [[ -e "$f" ]] || { echo "Falta $f. Ejecuta $SVC/install.sh" >&2; exit 1; }
done

set -a; source "$SVC/config/.env"; set +a

export JUPYTER_CONFIG_DIR="$SVC/config"
export JUPYTERLAB_SETTINGS_DIR="$SVC/config/lab/user-settings"
export JUPYTER_DATA_DIR="$SVC/data/share"
export JUPYTER_RUNTIME_DIR="$SVC/data/runtime"
export JUPYTERLAB_WORKSPACES_DIR="$SVC/data/workspaces"
export IPYTHONDIR="$SVC/data/ipython"
export JUPYTER_PLATFORM_DIRS=1

exec "$SVC/app/.venv/bin/jupyter" lab "$@"
