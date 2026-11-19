# Localiza un Node 24 (≥ 24.14), requisito de OpenChamber. Se carga con `source`.
# Prioridad: el Node 24 más reciente de nvm, después el de fnm y, si no hay, el `node` del PATH
# si es 24.x ≥ 24.14 (resuelto a su ruta real: los PATH de fnm son enlaces temporales por shell).
# find_node24 -> imprime el directorio bin/ de ese Node (código de salida 1 si no hay ninguno).
NODE24_MISSING_MSG="Falta Node 24 (≥ 24.14). Instálalo, p. ej. con: nvm install 24"

find_node24() {
  local dir
  dir="$( { ls -d "$HOME"/.nvm/versions/node/v24.*/bin 2>/dev/null | sort -V | tail -1; \
            ls -d "${FNM_DIR:-$HOME/.local/share/fnm}"/node-versions/v24.*/installation/bin 2>/dev/null \
              | sort -V | tail -1; } | head -1)"
  if [[ -n "$dir" ]]; then
    echo "$dir"
    return 0
  fi
  if command -v node > /dev/null \
    && node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a === 24 && b >= 14 ? 0 : 1)'; then
    dirname "$(readlink -f "$(command -v node)")"
    return 0
  fi
  return 1
}
