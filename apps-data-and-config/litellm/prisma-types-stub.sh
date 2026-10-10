#!/usr/bin/env bash
# Sustituye el types.py generado por Prisma por un stub ligero.
#
# Por qué: prisma generate escribe un types.py de cientos de miles de líneas con
# TypedDicts que solo sirven para tipado estático. En Python 3.14 (PEP 649) importarlos
# es cuadrático con el tamaño del módulo: medido aquí, ~52 s solo para prisma.types y
# ~3 min hasta que LiteLLM abre el puerto. Con el stub, el import baja a milisegundos.
# prisma-client-py no recibe mantenimiento desde 0.15.0, así que no habrá arreglo aguas arriba.
#
# Hay que ejecutarlo después de CADA prisma generate (lo hace install.sh).
# Uso: prisma-types-stub.sh [ruta-al-python-del-venv]
set -euo pipefail

PYTHON="${1:-${PYTHON:-python}}"

# find_spec localiza el paquete sin ejecutar prisma/__init__.py (que importaría el propio types.py).
PRISMA_DIR="$("$PYTHON" -c 'import importlib.util; print(importlib.util.find_spec("prisma").submodule_search_locations[0])')"
TARGET="$PRISMA_DIR/types.py"

if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: no existe $TARGET. Ejecuta antes prisma generate." >&2
  exit 1
fi

ORIGINAL_LINES="$(wc -l < "$TARGET")"

cat > "$TARGET" <<'STUB_EOF'
"""Stub de types.py: sustituye los TypedDicts generados por Prisma.

El módulo generado define decenas de miles de TypedDicts que solo existen para el
tipado estático: nada en prisma ni en LiteLLM los usa en ejecución. Este stub resuelve
cualquier nombre a typing.Any, de modo que el cliente sigue funcionando y el import
deja de costar minutos en Python 3.14.

Lo escribe prisma-types-stub.sh tras prisma generate. No editar a mano.
"""

from typing import Any

# Marca para comprobar que el stub está aplicado.
__genai_local_stack_stub__ = True

# Nombres que el cliente generado importa de forma explícita.
DatasourceOverride = Any
HttpConfig = Any
MetricsFormat = Any


def __getattr__(name: str) -> Any:
    """Cualquier tipo generado se resuelve a Any.

    Los dunders siguen lanzando AttributeError para no romper el sistema de imports.
    """
    if name.startswith("__") and name.endswith("__"):
        raise AttributeError(name)
    return Any
STUB_EOF

rm -rf "$PRISMA_DIR/__pycache__"
echo "Stub de tipos de Prisma aplicado: $TARGET ($ORIGINAL_LINES líneas -> $(wc -l < "$TARGET"))"
