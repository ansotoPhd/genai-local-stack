# Plantilla de configuración de Jupyter Server.
# install.sh la copia a jupyter_server_config.py (local, ignorado por git); edita ese fichero.
# El puerto se toma de JUPYTER_PORT (config/.env).
from pathlib import Path

c = get_config()  # noqa: F821

# Directorio raíz del navegador de ficheros: <repo>/workspace
c.ServerApp.root_dir = str(Path(__file__).resolve().parents[3] / "workspace")
c.ServerApp.ip = "127.0.0.1"
c.ServerApp.open_browser = True
