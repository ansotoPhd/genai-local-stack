# Plantilla de configuración de Jupyter Server.
# install.sh la copia a jupyter_server_config.py (local, ignorado por git); edita ese fichero.
# El puerto se toma de JUPYTER_PORT (config/.env).
from pathlib import Path

c = get_config()  # noqa: F821

# Directorio raíz del navegador de ficheros: <repo>/workspace
c.ServerApp.root_dir = str(Path(__file__).resolve().parents[3] / "workspace")
c.ServerApp.ip = "127.0.0.1"
c.ServerApp.open_browser = True

# Cifra con CurveZMQ el canal entre el servidor y los kernels (TCP en 127.0.0.1). IPC no es
# viable: la ruta de los sockets en data/runtime supera el límite de 107 caracteres de Linux.
# "required" hace fallar el arranque de un kernel que no admita cifrado (en vez de usar texto
# plano); si instalas uno así, cambia a "auto".
c.KernelManager.transport_encryption = "required"
