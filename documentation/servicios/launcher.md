# Launcher

Interfaz web (FastAPI + una página estática) para arrancar, parar y vigilar los servicios del stack. Está en `apps-data-and-config/launcher/` y se lanza con `./launcher.sh`, que abre http://127.0.0.1:8765.

## Qué hace

- **Arrancar core**: levanta Postgres y otel-lgtm, y después LiteLLM. otel-lgtm es opcional para LiteLLM: si no arranca (p. ej. sin Docker), LiteLLM arranca igual, sin trazas.
- **Abrir opencode**: con o sin memoria (Hindsight). Arranca lo que falte (core, y Hindsight si lo eliges) y abre su interfaz web con un enlace de un solo uso de su servidor de fondo. Cambiar la opción de memoria reinicia ese servidor.
  - La memoria se activa o desactiva en cada arranque con `HINDSIGHT_DISABLED`, sin tocar ficheros.
  - Si el servidor de fondo ya estaba en marcha fuera del launcher, se abre tal cual: la opción de memoria no se aplica y el launcher no lo para al cerrar.
- **Hindsight** y **JupyterLab**: botón de arrancar y parar, con enlaces (JupyterLab con su token).
- **Logs** de cada servicio en vivo, en el panel inferior. También se guardan en `launcher/data/logs/<servicio>.log`.
- **Borrar datos** (tarjeta de otel-lgtm): elimina métricas, trazas, logs, perfiles y lo guardado en Grafana (equivale a `otel-lgtm/stop.sh -v`). Pide confirmación y, si otel-lgtm estaba en marcha, lo vuelve a arrancar vacío.
- **Ctrl+C** para, en orden, todo lo que arrancó el launcher. Lo que ya estaba en marcha antes aparece como «externo» y no se toca.
- **Sin respuesta**: un servicio que arrancó el launcher, sigue vivo pero ha dejado de responder. Se puede parar desde su tarjeta. Si su proceso termina solo, pasa a «Error» con el código de salida y la cola del log.

## Cómo funciona

El catálogo de servicios está en `app/launcher/services.py`. Cada servicio define:

- su comando de arranque y parada (sus `start.sh`/`stop.sh`);
- su comprobación de salud (puerto TCP o petición HTTP);
- sus dependencias (obligatorias y opcionales) y sus enlaces.

Los puertos se leen del `config/.env` de cada servicio en cada consulta, así que el launcher sigue cualquier cambio de configuración.

Hay dos tipos de servicio:
- **process**: proceso de larga duración que el launcher vigila (LiteLLM, Hindsight, JupyterLab).
- **daemon**: comando que deja el servicio en segundo plano y termina (Postgres, otel-lgtm, el servidor de fondo de opencode).

El id de servicio coincide con su carpeta en `apps-data-and-config/`.

## Configuración

`launcher/config/.env`: `LAUNCHER_PORT`, `LAUNCHER_OPEN_BROWSER`… Las variables `LAUNCHER_*` también se pueden pasar por entorno, p. ej. `LAUNCHER_OPEN_BROWSER=false ./launcher.sh`.

## Seguridad

La API arranca procesos, entre ellos un agente con shell. Por eso:
- solo escucha en `127.0.0.1` (no admite otro `LAUNCHER_HOST`);
- rechaza peticiones con otra cabecera `Host`;
- exige la cabecera `X-Launcher: 1` en las acciones.

Así otra web abierta en el navegador no puede usarla.
