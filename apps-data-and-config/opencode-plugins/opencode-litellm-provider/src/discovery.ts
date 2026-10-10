import { readCache, writeCache } from './cache'
import { fetchModelInfo, fetchModels, normalizeBaseURL, type ModelMetadata } from './litellm-api'
import { errorMessage, log } from './log'
import { isChatModel, toConfigModel } from './model-mapping'
import type { ConfigModels } from './types'

export interface DiscoveryResult {
  models: ConfigModels
  source: 'live' | 'cache'
  savedAt: number
}

/** Marcador que identifica el provider de LiteLLM (en `settings` del provider). */
export function isLiteLLMProvider(settings: Record<string, unknown> | undefined): boolean {
  return settings?.litellm === true
}

/** URL raíz de LiteLLM: la del provider o, si no hay, LITELLM_BASE_URL (la rellena setup.sh). */
export function resolveBaseURL(configured: unknown): string | undefined {
  for (const candidate of [configured, process.env.LITELLM_BASE_URL]) {
    if (typeof candidate !== 'string') continue
    const normalized = normalizeBaseURL(candidate)
    // "{env:LITELLM_BASE_URL}/v1" con la variable vacía queda en "/v1" -> "".
    if (/^https?:\/\//.test(normalized)) return normalized
  }
  return undefined
}

export function resolveApiKey(configured: unknown): string | undefined {
  if (typeof configured === 'string' && configured) return configured
  return process.env.LITELLM_API_KEY || undefined
}

/** Consulta LiteLLM y construye los modelos de chat. Lanza un error si LiteLLM no responde. */
export async function discoverModels(baseURL: string, apiKey?: string): Promise<ConfigModels> {
  const [models, info] = await Promise.allSettled([
    fetchModels(baseURL, apiKey),
    fetchModelInfo(baseURL, apiKey),
  ])
  if (models.status === 'rejected') throw models.reason
  let infoByName = new Map<string, ModelMetadata>()
  if (info.status === 'fulfilled') {
    infoByName = info.value
  } else {
    log('warn', `Sin /v1/model/info (${errorMessage(info.reason)}): los modelos irán sin metadatos.`)
  }

  const built: ConfigModels = {}
  for (const { id } of models.value) {
    // "proveedor/*" es una regla de acceso (wildcard), no un modelo invocable.
    if (id.includes('/*')) continue
    const meta = infoByName.get(id)
    if (!isChatModel(id, meta)) continue
    built[id] = toConfigModel(id, meta)
  }
  return built
}

/** Descubre en vivo (y guarda en caché); si LiteLLM no responde, usa la última lista guardada. */
export async function loadModels(
  providerID: string,
  baseURL: string,
  apiKey?: string,
): Promise<DiscoveryResult | null> {
  try {
    const models = await discoverModels(baseURL, apiKey)
    writeCache(providerID, baseURL, models)
    log('info', `${Object.keys(models).length} modelos descubiertos en ${baseURL} para "${providerID}".`)
    return { models, source: 'live', savedAt: Date.now() }
  } catch (error) {
    const cached = readCache(providerID, baseURL)
    if (!cached) {
      log('warn', `LiteLLM no responde en ${baseURL} (${errorMessage(error)}) y no hay caché: "${providerID}" queda sin modelos descubiertos.`)
      return null
    }
    const when = new Date(cached.savedAt).toISOString()
    log('warn', `LiteLLM no responde en ${baseURL} (${errorMessage(error)}): se usan los modelos guardados el ${when}.`)
    return { models: cached.models, source: 'cache', savedAt: cached.savedAt }
  }
}
