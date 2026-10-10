// Derivado de yuseferi/opencode-litellm v1.4.2 (src/utils/litellm-api.ts), MIT © 2026 Yusef Mohamadi.
// Ver LICENSE y README.md (sección "Origen").

import { resolveReasoningEfforts } from './reasoning'
import type {
  LiteLLMModel,
  LiteLLMModelInfo,
  LiteLLMModelInfoResponse,
  LiteLLMModelsResponse,
} from './types'

/** Tiempo máximo por petición: LiteLLM es local, así que si no responde en esto, no está. */
export const REQUEST_TIMEOUT_MS = 8000

/** model_info enriquecido con los niveles de razonamiento ya resueltos. */
export interface ModelMetadata extends LiteLLMModelInfo {
  reasoning_efforts?: string[]
}

// Flags de capacidad que algunos deployments ponen en litellm_params en vez de en model_info.
const CAPABILITY_FLAGS = [
  'supports_vision',
  'supports_function_calling',
  'supports_reasoning',
  'supports_pdf_input',
  'supports_audio_input',
] as const

/** URL raíz del proxy: sin barra final ni sufijo /v1 (los endpoints se añaden después). */
export function normalizeBaseURL(baseURL: string): string {
  let normalized = baseURL.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/v1')) normalized = normalized.slice(0, -3)
  return normalized
}

async function getJSON<T>(baseURL: string, path: string, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(`${normalizeBaseURL(baseURL)}${path}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** Modelos a los que tiene acceso la clave (`GET /v1/models`). */
export async function fetchModels(baseURL: string, apiKey?: string): Promise<LiteLLMModel[]> {
  const data = await getJSON<LiteLLMModelsResponse>(baseURL, '/v1/models', apiKey)
  return data.data ?? []
}

/**
 * Metadatos por modelo (`GET /v1/model/info`), indexados por todos los alias con los que LiteLLM
 * puede identificarlo: model_name, model_info.key y litellm_params.model. Si un model_name tiene
 * varios deployments (balanceo), gana el primero.
 */
export async function fetchModelInfo(
  baseURL: string,
  apiKey?: string,
): Promise<Map<string, ModelMetadata>> {
  const data = await getJSON<LiteLLMModelInfoResponse>(baseURL, '/v1/model/info', apiKey)
  const byName = new Map<string, ModelMetadata>()
  for (const entry of data.data ?? []) {
    if (!entry.model_info) continue
    const params = entry.litellm_params ?? {}
    const info: ModelMetadata = { ...entry.model_info }
    for (const flag of CAPABILITY_FLAGS) {
      if (info[flag] == null && typeof params[flag] === 'boolean') info[flag] = params[flag] as boolean
    }
    info.reasoning_efforts = resolveReasoningEfforts(info, params)

    const aliases = [entry.model_name, info.key, typeof params.model === 'string' ? params.model : undefined]
    for (const alias of aliases) {
      if (alias && !byName.has(alias)) byName.set(alias, info)
    }
  }
  return byName
}
