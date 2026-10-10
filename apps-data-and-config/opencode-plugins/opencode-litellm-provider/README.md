# opencode-litellm-provider

Plugin de opencode que **descubre los modelos del proxy LiteLLM** del stack y los registra en el provider `local_litellm`, con sus metadatos: nombre legible, límites de contexto y salida, herramientas, modalidades (imagen, PDF, audio), precios y variantes de razonamiento (`reasoning_effort`). Así ya no hay que mantener a mano el bloque `models` de la config de opencode.

Documentación completa (funcionamiento, mapeo de campos, diagnóstico): [documentation/integraciones/opencode-litellm.md](../../../../documentation/integraciones/opencode-litellm.md).

## Uso

La plantilla `opencode/config/opencode.example.jsonc` ya lo carga:

```jsonc
"plugin": ["../../opencode-plugins/opencode-litellm-provider"],   // relativo al fichero de config
"providers": {
  "local_litellm": {
    "settings": { "litellm": true }
  }
}
```

- `litellm: true` marca el provider que gestiona el plugin.
- URL: `settings.baseURL` del provider o, si no hay, `LITELLM_BASE_URL`. Clave: `settings.apiKey` o `LITELLM_API_KEY`. Las dos variables están en `config/.env` y las rellena `setup.sh`.
- Los modelos que declares a mano en `models` se aplican **encima** de lo descubierto, campo a campo (p. ej. solo `name` o solo `limit.context`).
- Los modelos se vuelven a consultar al crear una sesión (como mucho una vez por minuto): un modelo nuevo en LiteLLM aparece en la sesión siguiente sin reiniciar.
- Si LiteLLM no responde, se usa la última lista guardada (`$XDG_CACHE_HOME/opencode-litellm-provider/`).
- Logs: `data/state/opencode-litellm-provider/plugin.log`.

No tiene dependencias de ejecución: opencode lo carga directamente (Bun ejecuta TypeScript), sin compilar ni instalar nada.

## Desarrollo

```bash
../install.sh          # herramientas de desarrollo (tipos de opencode, TypeScript, vitest)
npm run typecheck
npm test
../update.sh           # alinea los tipos con la versión de opencode instalada y actualiza el resto
```

| Fichero | Qué hace |
|---|---|
| `index.js` | Entrada del plugin (opencode carga `<dir>/index.js`) |
| `src/index.ts` | Exportación única `{ id, setup }` |
| `src/plugin.ts` | `setup` de opencode: `provider.transform`, `reload` y eventos |
| `src/discovery.ts` | Descubrimiento en vivo con respaldo en caché |
| `src/litellm-api.ts` | `GET /v1/models` y `GET /v1/model/info` |
| `src/model-mapping.ts` | model_info de LiteLLM → modelo de opencode; fusión con la config |
| `src/reasoning.ts` | Niveles de `reasoning_effort` que admite cada modelo |
| `src/cache.ts`, `src/log.ts` | Caché en disco y logs |

## Origen

Es una copia ligera, adaptada al stack, de partes de [yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm) **v1.4.2** (commit `72407ea`, licencia MIT, © 2026 Yusef Mohamadi), que a su vez se inspira en [agustif/opencode-lmstudio](https://github.com/agustif/opencode-lmstudio). Los ficheros derivados lo indican en su cabecera.

Se ha tomado:
- el enfoque de integración de v2: `provider.transform` + `reload`;
- las consultas a LiteLLM y el mapeo de capacidades y precios;
- la resolución de niveles de razonamiento, con sus tests.

Cambios respecto al original:
- Detección explícita por el marcador `litellm: true`. Se quitan la autodetección por puertos, la lectura de `auth.json`, los filtros y el formateo de nombres.
- Nombre legible desde `model_info.display_name` de LiteLLM.
- Fusión campo a campo con los modelos declarados a mano; en el original, estos sustituyen al descubierto.
- Variantes: se declaran low/medium/high para modelos de razonamiento sin lista de niveles.
- Descubrimiento en vivo en cada arranque, con la caché solo como respaldo; el original usa stale-while-revalidate.
- Sin dependencias de ejecución.
- Log a fichero.

Licencia: MIT (ver [LICENSE](LICENSE), que incluye el aviso de copyright original).
