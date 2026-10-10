"""python -m launcher: arranca el launcher en primer plano (Ctrl+C para todo lo que arrancó)."""

import uvicorn

from .main import app, shutting_down
from .services import launcher_env


class Server(uvicorn.Server):
    def handle_exit(self, sig, frame) -> None:
        # Avisa ya a los logs en vivo para que cierren solos, antes de que uvicorn espere a las
        # conexiones abiertas (si no, las cancela a la fuerza).
        shutting_down.set()
        super().handle_exit(sig, frame)


def main() -> None:
    env = launcher_env()
    host = env.get("LAUNCHER_HOST", "127.0.0.1")
    port = int(env.get("LAUNCHER_PORT", "8765"))
    if host not in ("127.0.0.1", "localhost"):
        # La API controla servicios (y un agente con shell): no se expone fuera de esta máquina.
        raise SystemExit(f"LAUNCHER_HOST={host} no permitido: el launcher solo escucha en 127.0.0.1.")
    print(f"Launcher en http://{host}:{port}", flush=True)
    config = uvicorn.Config(app, host=host, port=port, timeout_graceful_shutdown=5, log_level="warning")
    try:
        Server(config).run()
    except KeyboardInterrupt:  # uvicorn re-lanza la señal al terminar; el cierre ya está hecho
        pass


if __name__ == "__main__":
    main()
