# Postgres (pgvector)

Postgres 18 con la extensión pgvector (imagen `pgvector/pgvector`), en Docker. Está en `apps-data-and-config/postgres/`, escucha en `127.0.0.1:15432` (no en el 5432, para no chocar con otros Postgres) y guarda sus datos en `postgres/data/`.

## Bases de datos

Al inicializar `data/` por primera vez, la imagen crea la BD `POSTGRES_DB` (`genai`) y `app/initdb/01-genai.sh` activa en ella `vector` y crea las de los servicios:

| BD | Uso |
|---|---|
| `genai` | Tu trabajo (notebooks), con la extensión `vector` activada |
| `litellm` | Estado de LiteLLM: virtual keys, gasto, modelos añadidos desde la UI |
| `hindsight` | Bancos de memoria de Hindsight (Hindsight crea sus tablas al arrancar) |

Usuario, password y puerto están en `postgres/config/.env`. `setup.sh` genera la password y construye la `DATABASE_URL` de cada servicio.

## Operación

```bash
apps-data-and-config/postgres/start.sh                                 # arranca (segundo plano)
apps-data-and-config/postgres/stop.sh                                  # para (los datos se conservan)
apps-data-and-config/postgres/compose.sh exec postgres psql -U genai   # consola psql
```

`update.sh` actualiza el tag de la imagen dentro de la misma versión mayor. Cambiar de versión mayor requiere dump/restore.
