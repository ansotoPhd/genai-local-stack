"""Catálogo de servicios del stack: cómo se arrancan y paran (sus start.sh/stop.sh), cómo se
comprueba que están sanos y qué enlaces ofrecen. Los puertos se leen en cada consulta de los
config/.env de cada servicio, así que el launcher sigue cualquier cambio de configuración."""

import asyncio
import json
import os
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx
from dotenv import dotenv_values

# launcher/app/launcher/services.py -> apps-data-and-config/
APPS = Path(__file__).resolve().parents[3]

Kind = Literal["process", "daemon"]


def service_dir(service: str) -> Path:
    """Carpeta del servicio (el id coincide con su carpeta en apps-data-and-config/)."""
    return APPS / service


def read_env(service: str) -> dict[str, str]:
    """Variables del config/.env de un servicio (vacío si no existe)."""
    path = service_dir(service) / "config" / ".env"
    if not path.exists():
        return {}
    return {k: v or "" for k, v in dotenv_values(path).items()}


def launcher_env() -> dict[str, str]:
    """Config del launcher; las variables LAUNCHER_* del entorno tienen prioridad sobre el .env."""
    overrides = {k: v for k, v in os.environ.items() if k.startswith("LAUNCHER_")}
    return {**read_env("launcher"), **overrides}


@dataclass
class Link:
    label: str
    url: str


@dataclass
class Options:
    """Opciones de arranque elegidas en el launcher (hoy, solo para opencode)."""

    hindsight: bool = True


@dataclass
class Service:
    id: str
    name: str
    group: Literal["core", "memory", "client"]
    description: str
    kind: Kind
    # Comando de arranque. "process": proceso de larga duración que el launcher vigila.
    # "daemon": comando que deja el servicio en segundo plano y termina (Docker, servidor de opencode v2).
    start: Callable[[Options], list[str]]
    stop: Callable[[], list[str]] | None
    healthy: Callable[[], Awaitable[bool]]
    depends: Callable[[Options], list[str]] = lambda _opts: []
    # Dependencias opcionales: se intentan arrancar, pero si fallan no bloquean este servicio.
    soft_depends: Callable[[Options], list[str]] = lambda _opts: []
    # Comprobación previa al arranque: devuelve un mensaje de error si falta algo.
    precheck: Callable[[], str | None] = lambda: None
    env: Callable[[Options], dict[str, str]] = lambda _opts: {}
    links: Callable[[], list[Link]] = lambda: []
    # Borrado de datos (solo servicios Docker con volumen): comando y aviso de confirmación.
    reset: Callable[[], list[str]] | None = None
    reset_confirm: str = ""
    start_timeout: float = 120
    extra: dict = field(default_factory=dict)


# --------------------------------------------------------------------------------- salud


async def http_ok(url: str, *, any_status: bool = False) -> bool:
    """True si la URL responde (2xx, o cualquier respuesta HTTP con any_status).

    trust_env=False: las comprobaciones son a 127.0.0.1 y no deben pasar por HTTP(S)_PROXY/ALL_PROXY.
    Cualquier error (URL inválida por un puerto vacío, etc.) cuenta como "no responde"."""
    try:
        async with httpx.AsyncClient(timeout=1.5, trust_env=False) as client:
            r = await client.get(url)
        return True if any_status else r.status_code < 300
    except Exception:
        return False


async def tcp_open(port: str | int, host: str = "127.0.0.1") -> bool:
    try:
        _reader, writer = await asyncio.wait_for(asyncio.open_connection(host, int(port)), 1.5)
    except (OSError, ValueError, TimeoutError):
        return False
    writer.close()
    await writer.wait_closed()
    return True


# ------------------------------------------------------------------------------- helpers


def script(service: str, name: str, *args: str) -> list[str]:
    return [str(service_dir(service) / name), *args]


def opencode_env(opts: Options) -> dict[str, str]:
    # El plugin de Hindsight lee HINDSIGHT_DISABLED (nuestro hindsight.json no fija "disabled").
    return {"HINDSIGHT_DISABLED": "false" if opts.hindsight else "true"}


def opencode_depends(opts: Options) -> list[str]:
    return ["litellm", "hindsight"] if opts.hindsight else ["litellm"]


def jupyter_links() -> list[Link]:
    """URL con token del servidor de Jupyter en marcha (de su fichero de runtime)."""
    port = read_env("jupyterlab").get("JUPYTER_PORT", "8888")
    runtime = APPS / "jupyterlab" / "data" / "runtime"
    for f in sorted(runtime.glob("jpserver-*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            info = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if str(info.get("port")) == port:
            return [Link("JupyterLab", f"http://127.0.0.1:{port}/lab?token={info.get('token', '')}")]
    return [Link("JupyterLab", f"http://127.0.0.1:{port}/lab")]


PAIR_URL = re.compile(r"https?://\S+/auth/connect/\S+")


# ------------------------------------------------------------------------------ catálogo


def build_services() -> dict[str, Service]:
    pg = lambda: read_env("postgres")  # noqa: E731
    lgtm = lambda: read_env("otel-lgtm")  # noqa: E731
    lite = lambda: read_env("litellm")  # noqa: E731
    hs = lambda: read_env("hindsight")  # noqa: E731

    def hindsight_url(var: str, default: str) -> str:
        env = hs()
        return f"http://{env.get('HINDSIGHT_API_HOST', '127.0.0.1')}:{env.get(var, default)}"

    services = [
        Service(
            id="postgres",
            name="Postgres",
            group="core",
            description="Postgres 18 + pgvector (Docker)",
            kind="daemon",
            start=lambda _o: script("postgres", "start.sh"),
            stop=lambda: script("postgres", "stop.sh"),
            healthy=lambda: tcp_open(pg().get("POSTGRES_PORT", "15432")),
            start_timeout=180,
        ),
        Service(
            id="otel-lgtm",
            name="otel-lgtm",
            group="core",
            description="Backend OpenTelemetry: Grafana, Tempo, Loki, Prometheus (Docker)",
            kind="daemon",
            start=lambda _o: script("otel-lgtm", "start.sh"),
            stop=lambda: script("otel-lgtm", "stop.sh"),
            healthy=lambda: http_ok(f"http://127.0.0.1:{lgtm().get('LGTM_GRAFANA_PORT', '3000')}/api/health"),
            links=lambda: [Link("Grafana", f"http://127.0.0.1:{lgtm().get('LGTM_GRAFANA_PORT', '3000')}")],
            # down -v elimina el volumen con métricas, trazas, logs, perfiles y la BD de Grafana.
            reset=lambda: script("otel-lgtm", "stop.sh", "-v"),
            reset_confirm=(
                "Se borrarán todas las métricas, trazas, logs y perfiles de otel-lgtm, y también los "
                "dashboards o ajustes que hayas guardado en Grafana. Si está en marcha, se reiniciará "
                "vacío (unos segundos sin telemetría). ¿Continuar?"
            ),
            start_timeout=240,
        ),
        Service(
            id="litellm",
            name="LiteLLM",
            group="core",
            description="Gateway de modelos (OpenAI, Azure, Bedrock, OpenRouter)",
            kind="process",
            start=lambda _o: script("litellm", "start.sh"),
            stop=None,
            # Puerto en vez de /health: LiteLLM registra cada petición y el launcher consulta cada 2 s.
            # Uvicorn solo abre el puerto cuando LiteLLM ha terminado de arrancar.
            healthy=lambda: tcp_open(lite().get("LITELLM_PORT", "4000")),
            # Con BD, Postgres tiene que estar antes (LiteLLM aplica las migraciones al arrancar).
            # otel-lgtm es opcional: se intenta arrancar si hay trazas, pero si falla LiteLLM sigue.
            # Si comentas DATABASE_URL u OTEL_EXPORTER_OTLP_ENDPOINT, no se arrancan.
            depends=lambda _o: ["postgres"] if lite().get("DATABASE_URL") else [],
            soft_depends=lambda _o: ["otel-lgtm"] if lite().get("OTEL_EXPORTER_OTLP_ENDPOINT") else [],
            links=lambda: [Link("UI", f"http://127.0.0.1:{lite().get('LITELLM_PORT', '4000')}/ui")],
            start_timeout=300,
        ),
        Service(
            id="hindsight",
            name="Hindsight",
            group="memory",
            description="Memoria a largo plazo (API + UI)",
            kind="process",
            start=lambda _o: script("hindsight", "start.sh"),
            stop=None,
            healthy=lambda: http_ok(hindsight_url("HINDSIGHT_API_PORT", "8890") + "/health"),
            depends=lambda _o: ["postgres", "litellm"],
            links=lambda: [Link("UI", hindsight_url("HINDSIGHT_CP_PORT", "9999"))],
            # La primera vez descarga el modelo de embeddings (~470 MB).
            start_timeout=900,
        ),
        Service(
            id="jupyterlab",
            name="JupyterLab",
            group="memory",
            description="Notebooks sobre workspace/",
            kind="process",
            start=lambda _o: script("jupyterlab", "start.sh", "--no-browser"),
            stop=None,
            healthy=lambda: http_ok(f"http://127.0.0.1:{read_env('jupyterlab').get('JUPYTER_PORT', '8888')}/api"),
            depends=lambda _o: ["litellm"],
            links=jupyter_links,
        ),
        Service(
            id="opencode",
            name="opencode",
            group="client",
            description="Interfaz web de opencode (su servidor de fondo)",
            kind="daemon",
            # restart: el servidor conserva el entorno con el que arrancó (incluido HINDSIGHT_DISABLED).
            start=lambda _o: script("opencode", "start.sh", "service", "restart"),
            stop=lambda: script("opencode", "start.sh", "service", "stop"),
            healthy=lambda: tcp_open(read_env("opencode").get("OPENCODE_SERVICE_PORT", "49380")),
            depends=opencode_depends,
            env=opencode_env,
        ),
        Service(
            id="openchamber",
            name="OpenChamber",
            group="client",
            description="Interfaz web/PWA para opencode (gestiona su propia instancia)",
            kind="process",
            start=lambda _o: script("openchamber", "start.sh"),
            stop=None,
            healthy=lambda: http_ok(f"http://127.0.0.1:{read_env('openchamber').get('OPENCHAMBER_PORT', '3010')}/health"),
            depends=lambda _o: ["litellm"],
            links=lambda: [Link("Web", f"http://127.0.0.1:{read_env('openchamber').get('OPENCHAMBER_PORT', '3010')}")],
            start_timeout=180,
        ),
    ]
    return {s.id: s for s in services}


# Orden de parada: primero los clientes, después lo que estos usan.
STOP_ORDER = ["openchamber", "opencode", "jupyterlab", "hindsight", "litellm", "otel-lgtm", "postgres"]
CORE = ["postgres", "otel-lgtm", "litellm"]
