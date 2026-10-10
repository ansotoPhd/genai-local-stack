#!/usr/bin/env bash
# Instala todos los servicios, crea las configs locales desde las plantillas, añade a las existentes
# las variables nuevas de las plantillas y genera/propaga claves y conexiones entre servicios.
# Idempotente: nunca sobrescribe valores ya rellenados.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS="$ROOT/apps-data-and-config"
# Rutas relativas a apps-data-and-config/ (los plugins propios de opencode, en opencode-plugins/, no
# tienen dependencias de ejecución y no necesitan instalarse). openchamber necesita Node 24 (nvm).
OPENCODE=opencode
SERVICES=(postgres otel-lgtm litellm hindsight jupyterlab "$OPENCODE" openchamber launcher)
DOCKER_SERVICES=" postgres otel-lgtm "

# workspace/ es un repo git propio: así opencode lo toma como raíz del proyecto (y no este repo,
# con las .env del stack) y su búsqueda de ficheros no queda oculta por nuestro .gitignore.
mkdir -p "$ROOT/workspace"
if [[ ! -e "$ROOT/workspace/.git" ]]; then
  git -C "$ROOT/workspace" init -q -b main
  echo "==> Creado el repo git de workspace/"
fi
# opencode identifica el proyecto por su primer commit. Se comprueba aparte para recuperar un init
# que se quedara a medias; sin hooks ni firma, que dependen de la config global de cada usuario.
if ! git -C "$ROOT/workspace" rev-parse -q --verify HEAD > /dev/null; then
  git -C "$ROOT/workspace" -c user.name=genai-local-stack -c user.email=genai-local-stack@localhost \
    -c commit.gpgsign=false commit -q --no-verify --allow-empty -m "workspace"
fi
# README de bienvenida: se copia de la plantilla y no se pisa si ya existe (puedes editarlo).
if [[ ! -e "$ROOT/workspace/README.md" ]]; then
  cp "$ROOT/templates/workspace/README.md" "$ROOT/workspace/README.md"
  echo "==> Creado workspace/README.md desde templates/workspace/"
fi

for svc in "${SERVICES[@]}"; do
  if [[ "$DOCKER_SERVICES" == *" $svc "* ]] && ! command -v docker > /dev/null; then
    echo "==> Docker no está disponible: se omite $svc"
    continue
  fi
  # OpenChamber exige Node 24; sin él se omite sin romper el resto del stack.
  if [[ "$svc" == "openchamber" ]] && ! ls -d "$HOME"/.nvm/versions/node/v24.*/bin > /dev/null 2>&1; then
    echo "==> Node 24 no está disponible (nvm install 24): se omite $svc"
    continue
  fi
  echo "==> Instalando $svc"
  "$APPS/$svc/install.sh"
done

# env_get FICHERO VARIABLE -> valor (vacío si no existe)
env_get() {
  sed -n "s/^$2=//p" "$1" | tail -n 1
}

# env_add_missing PLANTILLA FICHERO: añade las variables nuevas de la plantilla con su valor por defecto.
# Una variable comentada en el fichero (#VAR=...) cuenta como presente.
env_add_missing() {
  local tpl=$1 file=$2 line var
  while IFS= read -r line || [[ -n "$line" ]]; do  # también la última línea sin salto final
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]] || continue
    var="${BASH_REMATCH[1]}"
    if ! grep -qE "^#? *$var=" "$file"; then
      printf '%s\n' "$line" >> "$file"
      echo "Añadida $var a ${file#"$ROOT/"}"
    fi
  done < "$tpl"
}

# env_set_if_empty FICHERO VARIABLE VALOR (conserva permisos del fichero).
# No toca variables comentadas (#VAR=...): así se desactiva una conexión.
env_set_if_empty() {
  local file=$1 var=$2 value=$3
  [[ -z "$(env_get "$file" "$var")" ]] || return 0
  if grep -q "^$var=" "$file"; then
    awk -v k="$var" -v v="$value" 'index($0, k "=") == 1 { $0 = k "=" v } { print }' "$file" > "$file.tmp"
    cat "$file.tmp" > "$file"
    rm "$file.tmp"
  elif grep -qE "^# *$var=" "$file"; then
    return 0
  else
    printf '%s=%s\n' "$var" "$value" >> "$file"
  fi
  echo "Rellenado $var en ${file#"$ROOT/"}"
}

random_hex() {
  head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

echo "==> Variables nuevas de las plantillas"
for svc in "${SERVICES[@]}"; do
  if [[ -f "$APPS/$svc/config/.env" ]]; then
    env_add_missing "$APPS/$svc/config/.env.example" "$APPS/$svc/config/.env"
  fi
done

echo "==> Claves y conexiones"
litellm_env="$APPS/litellm/config/.env"
jupyter_env="$APPS/jupyterlab/config/.env"
hindsight_env="$APPS/hindsight/config/.env"

master_key="$(env_get "$litellm_env" LITELLM_MASTER_KEY)"
if [[ -z "$master_key" ]]; then
  master_key="sk-local-$(random_hex)"
  env_set_if_empty "$litellm_env" LITELLM_MASTER_KEY "$master_key"
fi
env_set_if_empty "$jupyter_env" OPENAI_API_KEY "$master_key"
litellm_url="http://127.0.0.1:$(env_get "$litellm_env" LITELLM_PORT)"
for client in "$OPENCODE"; do
  env_set_if_empty "$APPS/$client/config/.env" LITELLM_API_KEY "$master_key"
  env_set_if_empty "$APPS/$client/config/.env" LITELLM_BASE_URL "$litellm_url"
done
env_set_if_empty "$hindsight_env" HINDSIGHT_API_LLM_API_KEY "$master_key"
env_set_if_empty "$hindsight_env" HINDSIGHT_API_LLM_BASE_URL "$litellm_url/v1"

pg_env="$APPS/postgres/config/.env"
if [[ -f "$pg_env" ]]; then
  env_set_if_empty "$pg_env" POSTGRES_PASSWORD "$(random_hex)"
  pg_url="postgresql://$(env_get "$pg_env" POSTGRES_USER):$(env_get "$pg_env" POSTGRES_PASSWORD)@127.0.0.1:$(env_get "$pg_env" POSTGRES_PORT)"
  env_set_if_empty "$litellm_env" DATABASE_URL "$pg_url/litellm"
  env_set_if_empty "$jupyter_env" DATABASE_URL "$pg_url/$(env_get "$pg_env" POSTGRES_DB)"
  env_set_if_empty "$hindsight_env" HINDSIGHT_API_DATABASE_URL "$pg_url/hindsight"
fi

lgtm_env="$APPS/otel-lgtm/config/.env"
if [[ -f "$lgtm_env" ]]; then
  otlp_endpoint="http://127.0.0.1:$(env_get "$lgtm_env" LGTM_OTLP_HTTP_PORT)"
  env_set_if_empty "$litellm_env" OTEL_EXPORTER_OTLP_ENDPOINT "$otlp_endpoint"
  env_set_if_empty "$jupyter_env" OTEL_EXPORTER_OTLP_ENDPOINT "$otlp_endpoint"
  env_set_if_empty "$hindsight_env" HINDSIGHT_API_OTEL_EXPORTER_OTLP_ENDPOINT "$otlp_endpoint"
fi

hindsight_url="http://$(env_get "$hindsight_env" HINDSIGHT_API_HOST):$(env_get "$hindsight_env" HINDSIGHT_API_PORT)"
for client in jupyterlab "$OPENCODE"; do
  env_set_if_empty "$APPS/$client/config/.env" HINDSIGHT_API_URL "$hindsight_url"
done

missing_keys=()
[[ -n "$(env_get "$litellm_env" OPENCODE_GO_API_KEY)" ]] || missing_keys+=(OPENCODE_GO_API_KEY)
if (( ${#missing_keys[@]} )); then
  echo
  echo "Claves de proveedor vacías en ${litellm_env#"$ROOT/"}: ${missing_keys[*]}"
  echo "Los modelos de esos proveedores no funcionarán hasta que las rellenes."
fi
echo
echo "Listo. Arranca el launcher: ./launcher.sh (o cada servicio a mano, ver README.md)."
