# Plugins de opencode

Plugins propios del stack. Se cargan desde la config de opencode con una ruta relativa (`"../../opencode-plugins/<plugin>"`) y no tienen dependencias de ejecución: no hace falta instalarlos para usarlos.

| Plugin | Qué hace |
|---|---|
| [opencode-litellm-provider](opencode-litellm-provider/) | Descubre los modelos de LiteLLM y sus metadatos (límites, capacidades, precios, variantes de razonamiento) |

Plugins de terceros que usa el stack (no están aquí: se instalan con opencode, en `opencode/app/`, con la versión fijada en su `package-lock.json`):

| Plugin | Qué hace |
|---|---|
| [@vectorize-io/hindsight-coding-agents](https://www.npmjs.com/package/@vectorize-io/hindsight-coding-agents) | Memoria a largo plazo con Hindsight |

## Desarrollo

- `install.sh`: instala las herramientas de desarrollo de todos los plugins (tipos de opencode, TypeScript, vitest). Solo hace falta para desarrollar o pasar los tests.
- `update.sh`: fija los tipos de opencode (`@opencode/plugin`) a la versión instalada en `opencode/`, actualiza el resto de herramientas y pasa typecheck y tests. Ejecútalo después de `opencode/update.sh`.

Para añadir un plugin: crea su carpeta con `package.json` (`"main": "index.js"`) e `index.js`. opencode carga `<dir>/index.js` y espera una exportación por defecto `{ id, setup }`. Después, añade su ruta al array `plugin` de la config de opencode (plantilla y local).
