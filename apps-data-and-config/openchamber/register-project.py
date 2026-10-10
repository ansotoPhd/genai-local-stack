#!/usr/bin/env python3
"""Registra el proyecto por defecto de OpenChamber (workspace) si no existe.

OpenChamber crea las sesiones sin proyecto activo en una carpeta temporal dentro de
data/openchamber/chats/, y el agente ejecuta sus comandos ahí. Este script añade el
directorio de OPENCHAMBER_OPENCODE_CWD (por defecto <repo>/workspace) a su lista de
proyectos y lo deja activo solo si no había ninguno válido. Idempotente.
"""
import base64
import json
import os
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path(os.environ.get("OPENCHAMBER_DATA_DIR", HERE / "data" / "openchamber"))
SETTINGS = DATA / "settings.json"

default_dir = os.environ.get("OPENCHAMBER_OPENCODE_CWD") or str(HERE.parents[1] / "workspace")
default_dir = os.path.realpath(default_dir)


def project_id(path: str) -> str:
    return "path_" + base64.urlsafe_b64encode(path.encode()).rstrip(b"=").decode()


settings = {}
if SETTINGS.exists():
    try:
        settings = json.loads(SETTINGS.read_text())
    except ValueError:
        print(f"aviso: {SETTINGS} no es JSON válido; no se toca", file=sys.stderr)
        raise SystemExit(0)

projects = [p for p in (settings.get("projects") or []) if isinstance(p, dict)]
now = int(time.time() * 1000)
existing = next((p for p in projects if p.get("path") == default_dir), None)
if existing:
    pid = existing.get("id") or project_id(default_dir)
elif pathlib.Path(default_dir).is_dir():
    pid = project_id(default_dir)
    projects.append({"id": pid, "path": default_dir, "addedAt": now, "lastOpenedAt": now})
else:
    print(f"aviso: {default_dir} no existe; no se registra ningún proyecto", file=sys.stderr)
    raise SystemExit(0)

settings["projects"] = projects
# Solo si no había un proyecto activo válido: si el usuario eligió otro, se respeta.
active = settings.get("activeProjectId")
if not active or not any(p.get("id") == active for p in projects):
    settings["activeProjectId"] = pid
    settings["lastDirectory"] = default_dir

DATA.mkdir(parents=True, exist_ok=True)
SETTINGS.write_text(json.dumps(settings, indent=2) + "\n")
print(f"Proyecto por defecto de OpenChamber: {default_dir}")
