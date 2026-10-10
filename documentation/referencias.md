# Referencias

## Ecosistema de opencode

- **[awesome-opencode](https://github.com/awesome-opencode/awesome-opencode)**: lista curada del ecosistema de opencode (plugins, temas, agentes, proyectos y recursos). Es el mejor punto de partida para buscar plugins antes de escribir uno propio. Presentación: [awesome-opencode: the essential plugin registry for AI coding agents](https://www.blog.brightcoding.dev/2026/07/19/awesome-opencodeawesome-opencode-the-essential-plugin-registry-for-ai-coding-agents) (Bright Coding, 2026-07-19).
- [opencode](https://opencode.ai) · [código fuente](https://github.com/anomalyco/opencode)
  - [documentación](https://opencode.ai/docs/), [plugins](https://opencode.ai/docs/plugins/), [providers](https://opencode.ai/docs/providers/), [modelos y variantes](https://opencode.ai/docs/models/), [config](https://opencode.ai/docs/config/) y su [JSON schema](https://opencode.ai/config.json)
  - Tipos de plugins en [`@opencode/plugin`](https://www.npmjs.com/package/@opencode/plugin)
- [models.dev](https://models.dev): catálogo de modelos (límites, capacidades, precios) que usa opencode para los providers conocidos.

### Plugins de la comunidad para LiteLLM

Se revisaron (2026-10) al diseñar [opencode-litellm-provider](integraciones/opencode-litellm.md):

| Plugin | Notas |
|---|---|
| [yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm) (npm `opencode-plugin-litellm`) | MIT. Específico de LiteLLM. **Base de nuestro plugin** (v1.4.2) |
| [yuhp/opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery) | MIT. Descubrimiento genérico para cualquier endpoint OpenAI-compatible, con enriquecimiento opcional desde LiteLLM o models.dev |
| [agustif/opencode-lmstudio](https://github.com/agustif/opencode-lmstudio) | MIT. Plugin para LM Studio en el que se inspira yuseferi/opencode-litellm |
| [Welington98/plugin-opencode-litellm](https://github.com/Welington98/plugin-opencode-litellm) | MIT. Usa `/model_group/info`; reglas conservadoras de capacidades |
| [danielcherubini/opencode-provider-litellm](https://github.com/danielcherubini/opencode-provider-litellm) | Incluye herramientas MCP y autenticación con gcloud |
| [BlakeHastings/opencode-litellm](https://github.com/BlakeHastings/opencode-litellm) | Flujo `/connect`; solo `/v1/models`, sin metadatos |

## Servicios

- **LiteLLM**: [documentación](https://docs.litellm.ai/), [config del proxy](https://docs.litellm.ai/docs/proxy/configs), [gestión de modelos](https://docs.litellm.ai/docs/proxy/model_management), [OpenTelemetry v2](https://docs.litellm.ai/docs/observability/opentelemetry_v2)
- **Hindsight**: [documentación](https://hindsight.vectorize.io), [integración con agentes de código](https://hindsight.vectorize.io/sdks/integrations/coding-agents)
- **otel-lgtm**: [grafana/docker-otel-lgtm](https://github.com/grafana/docker-otel-lgtm)
- **pgvector**: [pgvector/pgvector](https://github.com/pgvector/pgvector)
- **OpenTelemetry**: [convenciones semánticas GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- **uv**: [documentación](https://docs.astral.sh/uv/)
