# Cargado vía BASH_ENV por cada bash no interactivo que lanza opencode (comandos del agente).
# Restaura las rutas XDG del host que start.sh redirigió a data/, para que uv, git, gh... usen las normales.
if [[ -n "${GENAI_HOST_XDG_DATA_HOME:-}" ]]; then
  export XDG_DATA_HOME="$GENAI_HOST_XDG_DATA_HOME"
  export XDG_STATE_HOME="$GENAI_HOST_XDG_STATE_HOME"
  export XDG_CACHE_HOME="$GENAI_HOST_XDG_CACHE_HOME"
  export XDG_CONFIG_HOME="$GENAI_HOST_XDG_CONFIG_HOME"
fi
unset BASH_ENV
