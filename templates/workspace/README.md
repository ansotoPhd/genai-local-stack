# workspace

Área de trabajo del stack [genai-local-stack](../README.md).

## Qué es

Es el directorio donde trabajan los clientes del stack: **opencode** (la TUI y OpenChamber) y
**JupyterLab**. Aquí van tus proyectos, tus notebooks y las pruebas que hagas contra el gateway de
modelos y la memoria.

No es una carpeta más del repositorio: es un **repo git propio**, creado por `setup.sh` en el primer
arranque. El repo del stack lo ignora (`/workspace/` está en su `.gitignore`), así que lo que hagas
aquí no aparece en el repo donde viven los scripts y la configuración.

## Por qué separado

- **opencode toma como raíz del proyecto el primer repo git que encuentra.** Al arrancar aquí, no ve el
  repo del stack ni sus `.env`.
- El `.gitignore` del stack no oculta nada de lo que haya en este directorio.
- El selector «Añadir proyecto» de opencode solo ofrece carpetas dentro de `workspace/`
  (`OPENCODE_TEST_HOME`). Para trabajar en otro repositorio, clónalo aquí dentro.

## Cómo usarlo

```bash
# Un proyecto nuevo
git clone https://github.com/tu-usuario/tu-proyecto.git

# opencode sobre una carpeta concreta
apps-data-and-config/opencode/start.sh tu-proyecto
```

- Lo que esté suelto en este directorio va al banco de memoria `opencode::workspace`.
- Cada proyecto con su propio `.git` dentro tiene su banco (`opencode::<repo>`), así que las memorias
  no se mezclan.
- JupyterLab arranca aquí: los notebooks que crees viven en este directorio.
- OpenChamber abre este directorio como proyecto por defecto.

## Qué no va aquí

- Los scripts, la configuración y los datos del stack (viven en `apps-data-and-config/`).
- Nada que quieras versionar en el repo del stack: este es otro repositorio.

## Memoria

Hindsight guarda la memoria por banco y repo:

| Cliente | Banco |
|---|---|
| opencode | `opencode::<repo>` |
| JupyterLab | `jupyterlab` (`HINDSIGHT_BANK_ID`) |

Detalle: [opencode ↔ Hindsight](../documentation/integraciones/opencode-hindsight.md).
