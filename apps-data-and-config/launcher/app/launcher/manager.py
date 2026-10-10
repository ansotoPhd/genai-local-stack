"""Arranque y parada de los servicios del stack: dependencias, comprobación de salud y logs.

Solo se para al salir lo que arrancó el launcher ("managed"); lo que ya estaba en marcha se
muestra como "external" y no se toca. Quién gestiona un servicio no depende de su salud: el
launcher solo deja de gestionarlo cuando lo para él o cuando su proceso termina."""

import asyncio
import os
import signal
import time
import traceback
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .services import APPS, CORE, PAIR_URL, STOP_ORDER, Options, Service, build_services, script

LOGS = APPS / "launcher" / "data" / "logs"
STOP_TIMEOUT = 30
LOG_TAIL_BYTES = 256 * 1024


class StartError(Exception):
    pass


@dataclass
class State:
    phase: str | None = None  # acción en curso o resultado: starting | stopping | error | None
    managed: bool = False  # lo arrancó el launcher (y lo parará al cerrarse)
    error: str | None = None
    detail: str | None = None  # p. ej. "Esperando a Postgres"
    notice: str | None = None  # aviso informativo, p. ej. "se usa tal cual"
    options: Options | None = None
    process: asyncio.subprocess.Process | None = field(default=None, repr=False)


class Manager:
    def __init__(self) -> None:
        self.services = build_services()
        self.states = {sid: State() for sid in self.services}
        self.locks = {sid: asyncio.Lock() for sid in self.services}
        self.tasks: set[asyncio.Task] = set()
        LOGS.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------------- estado

    def log_path(self, sid: str) -> Path:
        return LOGS / f"{sid}.log"

    @staticmethod
    async def _healthy(svc: Service) -> bool:
        try:
            return await svc.healthy()
        except Exception:
            return False

    async def snapshot(self) -> list[dict]:
        # La salud solo decide lo que se muestra; nunca cambia quién gestiona cada servicio, así
        # que un resultado medido antes de un await no puede pisar un arranque o parada en curso.
        healths = await asyncio.gather(*(self._healthy(s) for s in self.services.values()))
        result = []
        for (sid, svc), ok in zip(self.services.items(), healths):
            st = self.states[sid]
            self._check_exited(st)
            result.append({
                "id": sid,
                "name": svc.name,
                "group": svc.group,
                "description": svc.description,
                "status": self._display_status(st, ok),
                "managed": st.managed,
                "error": st.error,
                "detail": st.detail if st.phase in ("starting", "stopping") else None,
                "notice": st.notice,
                "options": asdict(st.options) if st.options else None,
                "links": [asdict(link) for link in svc.links()] if ok else [],
                # Lo arrancado fuera solo se puede parar si tiene comando de parada (Docker, v2).
                "can_stop": st.managed or (ok and svc.stop is not None),
                "reset_confirm": svc.reset_confirm if svc.reset is not None else None,
            })
        return result

    @staticmethod
    def _check_exited(st: State) -> None:
        """Un proceso nuestro que terminó sin que lo paráramos deja de estar gestionado."""
        proc = st.process
        if proc is not None and proc.returncode is not None and st.phase not in ("starting", "stopping"):
            st.process, st.managed, st.options = None, False, None
            st.phase, st.error = "error", f"Terminó inesperadamente (código {proc.returncode}). Revisa el log."

    @staticmethod
    def _display_status(st: State, ok: bool) -> str:
        if st.phase in ("starting", "stopping"):
            return st.phase
        if st.phase == "error" and not ok:
            return "error"
        if st.managed:
            return "running" if ok else "unhealthy"
        return "external" if ok else "stopped"

    def clear_messages(self, sid: str) -> None:
        """Al pedir una acción, se olvidan el error y el aviso anteriores de ese servicio."""
        st = self.states[sid]
        st.error = st.notice = None
        if st.phase == "error":
            st.phase = None

    # ---------------------------------------------------------------- tareas de fondo

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def start_safe(self, sid: str, opts: Options | None = None) -> None:
        try:
            await self.start(sid, opts)
        except StartError:
            pass  # el error ya está en el estado del servicio

    async def start_core(self) -> None:
        await asyncio.gather(*(self.start_safe(sid) for sid in CORE))

    # ----------------------------------------------------------------------- arranque

    async def start(self, sid: str, opts: Options | None = None) -> None:
        svc, st = self.services[sid], self.states[sid]
        try:
            await self._start(svc, st, opts or Options())
        except StartError as e:
            st.phase, st.error, st.detail = "error", str(e), None
            raise
        except Exception as e:  # imprevisto: que no se quede en "Arrancando…" para siempre
            self._log_text(sid, traceback.format_exc())
            st.phase, st.error, st.detail = "error", f"Error inesperado: {e}. Revisa el log.", None
            raise StartError(st.error) from e

    async def _start(self, svc: Service, st: State, opts: Options) -> None:
        sid = svc.id
        option_sensitive = sid == "opencode"

        problem = svc.precheck()
        if problem:
            raise StartError(problem)

        # Dependencias primero, en paralelo (cada una toma su propio lock). Las opcionales
        # (telemetría) se intentan, pero si fallan no impiden arrancar este servicio.
        hard, soft = svc.depends(opts), svc.soft_depends(opts)
        deps = hard + soft
        if deps:
            ups = await asyncio.gather(*(self._healthy(self.services[d]) for d in deps))
            pending = [self.services[d].name for d, up in zip(deps, ups) if not up]
            if pending and not st.managed and st.phase in (None, "error"):
                st.phase, st.error, st.detail = "starting", None, f"Esperando a {', '.join(pending)}"
            results = await asyncio.gather(*(self.start(d) for d in deps), return_exceptions=True)
            failed = [self.services[d].name for d, r in zip(hard, results) if isinstance(r, BaseException)]
            if failed:
                raise StartError(f"No se pudo arrancar: {', '.join(failed)}")

        async with self.locks[sid]:
            st.error = None
            healthy = await self._healthy(svc)
            ours_alive = st.process is not None and st.process.returncode is None
            if ours_alive:
                if healthy and (not option_sensitive or st.options == opts):
                    st.phase = st.detail = None
                    return
                if not healthy:
                    raise StartError("Está en marcha pero no responde: páralo y vuelve a arrancarlo.")
                await self._stop_locked(sid)  # opciones distintas: se reinicia el nuestro
            elif healthy:
                if not st.managed:
                    # Arrancado fuera del launcher: se usa tal cual, sin pararlo ni adoptarlo.
                    st.phase = st.detail = None
                    if option_sensitive:
                        st.notice = "Ya estaba en marcha fuera del launcher: se usa tal cual (la opción de memoria no se aplica)."
                    return
                if not option_sensitive or st.options == opts:
                    st.phase = st.detail = None
                    return
                # daemon nuestro (opencode v2) con otras opciones: su arranque es un "restart"

            st.phase, st.detail = "starting", None
            self._log_header(sid, "arrancando")
            if svc.kind == "process":
                await self._start_process(svc, st, opts)
            else:
                # Gestionado desde antes de lanzar el comando: si se corta a medias (cierre del
                # launcher, timeout), lo que llegara a arrancar se parará igualmente al salir.
                st.managed = True
                await self._run(sid, svc.start(opts), svc.env(opts), svc.start_timeout)
                await self._wait_healthy(svc, st, timeout=60)
            st.phase, st.options = None, opts

    async def _start_process(self, svc: Service, st: State, opts: Options) -> None:
        with open(self.log_path(svc.id), "ab") as log:
            st.process = await asyncio.create_subprocess_exec(
                *svc.start(opts),
                stdin=asyncio.subprocess.DEVNULL, stdout=log, stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, **svc.env(opts)},
                start_new_session=True,  # Ctrl+C en el terminal del launcher no le llega directamente
            )
        st.managed = True
        try:
            await self._wait_healthy(svc, st, timeout=svc.start_timeout)
        except BaseException:
            # No dejar huérfano un proceso que no llegó a estar listo (timeout, fallo o cierre).
            await _terminate(st.process)
            st.process, st.managed = None, False
            raise

    async def _wait_healthy(self, svc: Service, st: State, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await self._healthy(svc):
                return
            if st.process is not None and st.process.returncode is not None:
                raise StartError(f"Terminó con código {st.process.returncode} antes de estar listo. Revisa el log.")
            await asyncio.sleep(1)
        raise StartError(f"No respondió en {int(timeout)} s. Revisa el log.")

    async def _run(self, sid: str, cmd: list[str], env: dict[str, str], timeout: float, capture: bool = False) -> str:
        """Ejecuta un comando que termina (start.sh/stop.sh de Docker, service de v2). Su salida va
        al log del servicio a medida que se produce; con capture, además se devuelve."""
        with open(self.log_path(sid), "ab") as log:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE if capture else log,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, **env}, start_new_session=True,
            )
        text = ""
        try:
            if capture:
                out, _ = await asyncio.wait_for(proc.communicate(), timeout)
                text = out.decode(errors="replace")
                self._log_text(sid, text)
            else:
                await asyncio.wait_for(proc.wait(), timeout)
        except TimeoutError:
            raise StartError(f"{Path(cmd[0]).name} no terminó en {int(timeout)} s. Revisa el log.") from None
        finally:
            if proc.returncode is None:  # timeout o cancelación (cierre del launcher)
                _killpg(proc.pid, signal.SIGKILL)
                await proc.wait()
        if proc.returncode != 0:
            raise StartError(f"{' '.join(Path(c).name for c in cmd[:3])} falló (código {proc.returncode}). Revisa el log.")
        return text

    async def pair(self, sid: str = "opencode") -> str:
        """Enlace nuevo de un solo uso (caduca en 5 min) para abrir la web de opencode."""
        out = await self._run(sid, script("opencode", "start.sh", "pair"), {}, 60, capture=True)
        match = PAIR_URL.search(out)
        if not match:
            raise StartError("opencode no devolvió un enlace de acceso. Revisa el log.")
        return match.group(0)

    # ------------------------------------------------------------------------- parada

    async def stop(self, sid: str) -> None:
        async with self.locks[sid]:
            try:
                await self._stop_locked(sid)
            except Exception as e:
                self._log_text(sid, traceback.format_exc())
                st = self.states[sid]
                st.phase, st.error, st.detail = "error", f"Error inesperado al parar: {e}. Revisa el log.", None

    async def _stop_locked(self, sid: str) -> None:
        svc, st = self.services[sid], self.states[sid]
        if st.process is None and svc.stop is None:
            st.error = "Se arrancó fuera del launcher: páralo desde donde lo lanzaste."
            return
        st.phase, st.error, st.notice, st.detail = "stopping", None, None, None
        self._log_header(sid, "parando")
        try:
            if st.process is not None:
                await _terminate(st.process)
            else:
                await self._run(sid, svc.stop(), {}, 120)
        except StartError as e:
            st.phase, st.error = "error", str(e)
            return
        st.phase, st.managed, st.process, st.options = None, False, None, None

    async def reset(self, sid: str) -> None:
        """Borra los datos del servicio y, si estaba en marcha, lo vuelve a arrancar vacío."""
        svc, st = self.services[sid], self.states[sid]
        if svc.reset is None:
            return
        async with self.locks[sid]:
            st.error = st.notice = None
            was_running, was_managed = await self._healthy(svc), st.managed
            st.phase, st.detail = "stopping", "Borrando datos"
            self._log_header(sid, "borrando datos de")
            try:
                await self._run(sid, svc.reset(), {}, 180)
                if was_running:
                    st.phase, st.detail = "starting", "Arrancando vacío"
                    await self._run(sid, svc.start(Options()), {}, svc.start_timeout)
                    await self._wait_healthy(svc, st, timeout=60)
            except StartError as e:
                st.phase, st.error, st.detail = "error", str(e), None
                return
            # Conserva quién lo gestiona: si estaba arrancado fuera del launcher, sigue siendo externo.
            st.phase = st.detail = None
            st.managed = was_running and was_managed

    async def stop_all(self) -> None:
        """Para, en orden, todo lo que arrancó el launcher."""
        for sid in STOP_ORDER:
            if self.states[sid].managed:
                await self.stop(sid)

    async def shutdown(self) -> None:
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await self.stop_all()

    # --------------------------------------------------------------------------- logs

    def _log_header(self, sid: str, action: str) -> None:
        self._log_text(sid, f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} · launcher: {action} {sid} =====\n")

    def _log_text(self, sid: str, text: str) -> None:
        with open(self.log_path(sid), "a") as log:
            log.write(text)

    def tail(self, sid: str, lines: int = 200) -> tuple[str, int]:
        """Últimas líneas del log y posición de fin (para seguir en streaming desde ahí)."""
        path = self.log_path(sid)
        if not path.exists():
            return "", 0
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - LOG_TAIL_BYTES))
            data = f.read().decode(errors="replace")
        tail = "\n".join(data.splitlines()[-lines:])
        # Con salto final, lo que llegue después en streaming empieza en una línea nueva.
        return (tail + "\n" if tail else ""), size


def _killpg(pid: int, sig: signal.Signals) -> None:
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        pass


async def _terminate(proc: asyncio.subprocess.Process) -> None:
    """SIGTERM al grupo de procesos (los start.sh lo propagan) y SIGKILL si no acaba a tiempo."""
    if proc.returncode is not None:
        return
    _killpg(proc.pid, signal.SIGTERM)
    try:
        await asyncio.wait_for(proc.wait(), STOP_TIMEOUT)
    except TimeoutError:
        _killpg(proc.pid, signal.SIGKILL)
        await proc.wait()
