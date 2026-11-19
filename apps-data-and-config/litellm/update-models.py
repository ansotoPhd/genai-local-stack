#!/usr/bin/env python3
"""Regenera el bloque model_list de LiteLLM desde el catálogo de OpenCode Go.

Consulta https://opencode.ai/inference/go/v1/models (público, sin clave) y reescribe la sección
`model_list:` de config/config.example.yaml (la plantilla versionada), entre `model_list:` y el
bloque de ajustes que la sigue. El resto del fichero no se toca. Un modelo por entrada `go-<id>`,
en orden alfabético, con este mapeo:

  name                              -> display_name ("<name> (OpenCode Go)")
  limit.input (o .context) / .output -> max_input_tokens / max_output_tokens
  cost.text (USD por millón)        -> *_cost_per_token (input, output, cache read/write; si la
                                       escritura tiene varias TTL, la más corta)
  capabilities.tools                -> supports_function_calling
  modalities.input (image/pdf/audio)-> supports_vision / supports_pdf_input / supports_audio_input
  capabilities.reasoning            -> supports_reasoning + reasoning_effort_levels

Todos los modelos van por el endpoint compatible con OpenAI del gateway de Go (openai/<id>). Los
multiplicadores de precio por horario o fecha (cost.multipliers) no se trasladan: LiteLLM no los
admite y se usa el precio base.

Uso:
  update-models.py            reescribe la plantilla y muestra los modelos añadidos/retirados
  update-models.py --check    solo informa de diferencias (código de salida 1 si las hay)
  update-models.py --local    además reescribe config/config.yaml (tu config local)
"""
import argparse
import difflib
import json
import pathlib
import re
import sys
import urllib.request
from decimal import Decimal

CATALOG_URL = "https://opencode.ai/inference/go/v1/models"
API_BASE = "https://opencode.ai/inference/go/openai/v1"
SESSION_ID = "86745f52-0cfb-508d-84b2-6efa56e9a04a"
USER_AGENT = "genai-local-stack/1.0"

SVC = pathlib.Path(__file__).resolve().parent
TEMPLATE = SVC / "config" / "config.example.yaml"
LOCAL = SVC / "config" / "config.yaml"

# La sección empieza en "model_list:" y termina en la primera línea de nivel 0 (comentario o clave)
# que la siga, p. ej. el banner "# ****" de AJUSTES DE LITELLM.
SECTION_RE = re.compile(r"^model_list:\n(?:(?:[ \t].*|)\n)*", re.MULTILINE)


def fetch_catalog() -> list[dict]:
    req = urllib.request.Request(CATALOG_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    models = data["data"] if isinstance(data, dict) else data
    return sorted((m for m in models if m.get("type", "chat") == "chat"), key=lambda m: m["id"])


def per_token(price_per_million) -> str:
    """USD por millón de tokens -> USD por token, con el formato de float de Python (1.5e-07)."""
    if not price_per_million:
        return "0"
    return repr(float(Decimal(str(price_per_million)) / Decimal(1_000_000)))


def cache_write_price(write):
    """Precio de escritura en caché: un número o, si hay varias TTL ({"30m": x, "12h": y}), el de la
    más corta, que es la que LiteLLM aplica por defecto."""
    if not isinstance(write, dict):
        return write
    seconds = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    ttl = min(write, key=lambda k: int(k[:-1]) * seconds[k[-1]])
    return write[ttl]


def render_model(m: dict) -> str:
    caps = m.get("capabilities", {})
    inputs = m.get("modalities", {}).get("input", [])
    text_cost = m.get("cost", {}).get("text", {})
    cache = text_cost.get("input", {}).get("cache", {})
    reasoning = caps.get("reasoning", {})

    info = [
        f"display_name: {json.dumps(m['name'] + ' (OpenCode Go)', ensure_ascii=False)}",
        f"max_input_tokens: {m['limit'].get('input', m['limit']['context'])}",
        f"max_output_tokens: {m['limit']['output']}",
        f"input_cost_per_token: {per_token(text_cost.get('input', {}).get('price'))}",
        f"output_cost_per_token: {per_token(text_cost.get('output', {}).get('price'))}",
        f"cache_read_input_token_cost: {per_token(cache.get('read'))}",
    ]
    if "write" in cache:
        info.append(f"cache_creation_input_token_cost: {per_token(cache_write_price(cache['write']))}")
    info.append(f"supports_function_calling: {str(caps.get('tools', {}).get('supported', False)).lower()}")
    if any(x.startswith("image") for x in inputs):
        info.append("supports_vision: true")
    if "application/pdf" in inputs:
        info.append("supports_pdf_input: true")
    if any(x.startswith("audio") for x in inputs):
        info.append("supports_audio_input: true")
    info.append(f"supports_reasoning: {str(reasoning.get('supported', False)).lower()}")
    if reasoning.get("supported"):
        info.append(f"reasoning_effort_levels: [{', '.join(reasoning.get('effort', []))}]")
    info.append("mode: chat")

    lines = [
        f"  - model_name: go-{m['id']}",
        "    litellm_params:",
        f"      model: openai/{m['id']}",
        "      litellm_credential_name: opencode_go",
        f"      api_base: {API_BASE}",
        "      extra_headers:",
        f"        x-opencode-session: {SESSION_ID}",
        f"        User-Agent: {USER_AGENT}",
        "      drop_params: true",
        "    model_info:",
        *(f"      {line}" for line in info),
    ]
    return "\n".join(lines) + "\n"


def render_section(models: list[dict]) -> str:
    return "model_list:\n\n" + "\n".join(render_model(m) for m in models) + "\n"


def model_names(section: str) -> set[str]:
    return set(re.findall(r"^  - model_name: (\S+)$", section, re.MULTILINE))


def update_file(path: pathlib.Path, section: str, check: bool) -> bool:
    """Reescribe la sección model_list de `path`. Devuelve True si había diferencias."""
    text = path.read_text()
    match = SECTION_RE.search(text)
    if not match:
        sys.exit(f"No se encontró la sección model_list en {path}")
    old = match.group(0)
    if old == section:
        print(f"{path.relative_to(SVC)}: sin cambios")
        return False

    added = sorted(model_names(section) - model_names(old))
    removed = sorted(model_names(old) - model_names(section))
    changed = [
        name for name in sorted(model_names(section) & model_names(old))
        if block(old, name) != block(section, name)
    ]
    print(f"{path.relative_to(SVC)}:")
    print(f"  añadidos:   {', '.join(added) or '-'}")
    print(f"  retirados:  {', '.join(removed) or '-'}")
    print(f"  cambiados:  {', '.join(changed) or '-'}")
    if check:
        diff = difflib.unified_diff(
            old.splitlines(keepends=True), section.splitlines(keepends=True),
            fromfile=f"{path.name} (actual)", tofile=f"{path.name} (catálogo)", n=1,
        )
        sys.stdout.writelines(diff)
    else:
        path.write_text(text[: match.start()] + section + text[match.end():])
    return True


def block(section: str, name: str) -> str:
    m = re.search(rf"^  - model_name: {re.escape(name)}\n(?:    .*\n|      .*\n|        .*\n)*", section, re.MULTILINE)
    return m.group(0) if m else ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="solo informa de las diferencias")
    parser.add_argument("--local", action="store_true", help="aplica también a config/config.yaml")
    args = parser.parse_args()

    section = render_section(fetch_catalog())
    targets = [TEMPLATE] + ([LOCAL] if args.local and LOCAL.exists() else [])
    differs = [update_file(path, section, args.check) for path in targets]

    if args.check:
        sys.exit(1 if any(differs) else 0)
    if differs[0] and not args.local:
        print("Tu config/config.yaml no se ha tocado: usa --local para aplicar el catálogo también ahí.")
    if any(differs):
        print("Reinicia LiteLLM para cargar los cambios.")


if __name__ == "__main__":
    main()
