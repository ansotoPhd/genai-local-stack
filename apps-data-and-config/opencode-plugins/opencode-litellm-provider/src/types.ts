// Derivado de yuseferi/opencode-litellm v1.4.2 (src/types/index.ts), MIT © 2026 Yusef Mohamadi.
// Ver LICENSE y README.md (sección "Origen").

/** Entrada de `GET /v1/models` (esquema OpenAI). */
export interface LiteLLMModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
}

export interface LiteLLMModelsResponse {
  data?: LiteLLMModel[]
}

/**
 * Bloque `model_info` de `GET /v1/model/info`. LiteLLM lo completa con su mapa de modelos conocidos
 * (límites, precios, capacidades) y con lo que se declare en `model_info` en config.yaml o en la UI.
 */
export interface LiteLLMModelInfo {
  id?: string
  key?: string
  mode?: string | null
  /** Nombre legible propio del stack (clave libre en model_info de config.yaml). */
  display_name?: string | null
  max_tokens?: number | null
  max_input_tokens?: number | null
  max_output_tokens?: number | null
  supports_function_calling?: boolean | null
  supports_vision?: boolean | null
  supports_reasoning?: boolean | null
  supports_pdf_input?: boolean | null
  supports_audio_input?: boolean | null
  reasoning_effort_levels?: string[] | null
  supported_openai_params?: string[] | null
  input_cost_per_token?: number | null
  output_cost_per_token?: number | null
  cache_read_input_token_cost?: number | null
  cache_creation_input_token_cost?: number | null
  [key: string]: unknown
}

/** Entrada de `GET /v1/model/info`: una por deployment (un model_name puede repetirse). */
export interface LiteLLMModelInfoEntry {
  model_name: string
  litellm_params?: Record<string, unknown>
  model_info?: LiteLLMModelInfo | null
}

export interface LiteLLMModelInfoResponse {
  data?: LiteLLMModelInfoEntry[]
}

/** Modelo en el formato de config de opencode (`provider.<id>.models.<id>`). */
export interface ConfigModel {
  name?: string
  limit?: { context: number; output: number }
  tool_call?: boolean
  reasoning?: boolean
  attachment?: boolean
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number }
  modalities?: { input: string[]; output: string[] }
  variants?: Record<string, Record<string, unknown>>
  [key: string]: unknown
}

export type ConfigModels = Record<string, ConfigModel>
