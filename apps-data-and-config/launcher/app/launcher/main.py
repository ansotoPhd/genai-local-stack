"""API y front del launcher. Al cerrarse (Ctrl+C), para todo lo que arrancó."""

import asyncio
import json
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .manager import Manager, StartError
from .services import CORE, Options, launcher_env, tcp_open

STATIC = Path(__file__).parent / "static"
shutting_down = asyncio.Event()

# Solo escucha en local. Comprobar el Host evita el DNS rebinding (una web externa que resuelve su
# dominio a 127.0.0.1 para leer la API).
LOCAL_HOSTS: list[str] = ["127.0.0.1", "localhost"]
# Cabecera que pone el front en las acciones: una web externa no puede añadirla sin un preflight
# CORS, que este servidor no permite, así que no puede disparar acciones (CSRF) ni leer /api/info.
CSRF_HEADER = "x-launcher"


async def open_browser_when_ready(host: str, port: int) -> None:
    for _ in range(60):
        if await tcp_open(port, host):
            await asyncio.to_thread(webbrowser.open, f"http://{host}:{port}")
            return
        await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.manager = Manager()
    env = launcher_env()
    if env.get("LAUNCHER_OPEN_BROWSER", "true").lower() == "true":
        asyncio.create_task(open_browser_when_ready(env.get("LAUNCHER_HOST", "127.0.0.1"), int(env.get("LAUNCHER_PORT", "8765"))))
    yield
    shutting_down.set()
    print("\nParando los servicios que arrancó el launcher (no pulses Ctrl+C otra vez)…", flush=True)
    await app.state.manager.shutdown()
    print("Todo parado.", flush=True)


app = FastAPI(title="genai-local-stack launcher", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=LOCAL_HOSTS)


@app.middleware("http")
async def require_launcher_header(request: Request, call_next):
    sensitive = request.method not in ("GET", "HEAD") or request.url.path == "/api/info"
    if sensitive and request.headers.get(CSRF_HEADER) != "1":
        return JSONResponse({"detail": "Petición no permitida."}, status_code=403)
    return await call_next(request)


def manager(request: Request) -> Manager:
    return request.app.state.manager


def known(request: Request, sid: str) -> Manager:
    m = manager(request)
    if sid not in m.services:
        raise HTTPException(404, f"Servicio desconocido: {sid}")
    return m


class StartBody(BaseModel):
    hindsight: bool = True


class OpencodeBody(BaseModel):
    hindsight: bool = True


@app.get("/api/services")
async def services(request: Request):
    return await manager(request).snapshot()


@app.post("/api/services/{sid}/start", status_code=202)
async def start(request: Request, sid: str, body: StartBody | None = None):
    m = known(request, sid)
    m.clear_messages(sid)
    m.spawn(m.start_safe(sid, Options(hindsight=body.hindsight) if body else None))
    return {"ok": True}


@app.post("/api/services/{sid}/stop", status_code=202)
async def stop(request: Request, sid: str):
    m = known(request, sid)
    m.clear_messages(sid)
    m.spawn(m.stop(sid))
    return {"ok": True}


@app.post("/api/services/{sid}/reset", status_code=202)
async def reset(request: Request, sid: str):
    m = known(request, sid)
    if m.services[sid].reset is None:
        raise HTTPException(400, "Este servicio no tiene datos que borrar desde el launcher.")
    m.clear_messages(sid)
    m.spawn(m.reset(sid))
    return {"ok": True}


@app.post("/api/core/start", status_code=202)
async def start_core(request: Request):
    m = manager(request)
    for sid in CORE:
        m.clear_messages(sid)
    m.spawn(m.start_core())
    return {"ok": True}


@app.post("/api/opencode/start", status_code=202)
async def start_opencode(request: Request, body: OpencodeBody):
    m = manager(request)
    sid = "opencode"
    m.clear_messages(sid)
    m.spawn(m.start_safe(sid, Options(hindsight=body.hindsight)))
    return {"ok": True}


@app.post("/api/opencode/pair")
async def pair(request: Request):
    try:
        return {"url": await manager(request).pair()}
    except StartError as e:
        raise HTTPException(502, str(e)) from None


@app.post("/api/stop-all", status_code=202)
async def stop_all(request: Request):
    m = manager(request)
    m.spawn(m.stop_all())
    return {"ok": True}


@app.get("/api/services/{sid}/logs")
async def logs(request: Request, sid: str, lines: int = 200):
    text, _ = known(request, sid).tail(sid, lines)
    return {"text": text}


@app.get("/api/services/{sid}/logs/stream")
async def logs_stream(request: Request, sid: str):
    """Log en vivo (Server-Sent Events): primero las últimas líneas, después lo que se añada."""
    m = known(request, sid)

    async def events():
        text, pos = m.tail(sid)
        yield f"data: {json.dumps(text)}\n\n"
        path = m.log_path(sid)
        while not shutting_down.is_set() and not await request.is_disconnected():
            size = path.stat().st_size if path.exists() else 0
            if size < pos:  # el log se ha vaciado o rotado
                pos = 0
            if size > pos:
                with open(path, "rb") as f:
                    f.seek(pos)
                    chunk = f.read(size - pos).decode(errors="replace")
                pos = size
                yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
