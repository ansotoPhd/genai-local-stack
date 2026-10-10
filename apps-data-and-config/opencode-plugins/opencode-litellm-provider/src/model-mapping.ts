// toConfigModel y la conversión a Model.Info derivan de yuseferi/opencode-litellm v1.4.2 (src/plugin/index.ts y
// src/plugin/v2.ts), MIT © 2026 Yusef Mohamadi. Ver LICENSE y README.md (sección "Origen").

import type { Model } from '@opencode/plugin'
import type { ModelMetadata } from './litellm-api'
import type { ConfigModel, ConfigModels } from './types'

/** Niveles de razonamiento que se declaran cuando el modelo no informa una lista propia. */
export const DEFAULT_EFFORTS = ['low', 'medium', 'high']

// LiteLLM informa precios en USD por token; opencode los quiere en USD por millón de tokens.
// toPrecision quita el ruido de coma flotante (1e-7 * 1e6 = 0.09999999999999999).
const perMillion = (usdPerToken: number): number => Number((usdPerToken * 1_000_000).toPrecision(12))

const CHAT_MODES = new Set(['chat', 'completion', 'responses'])
const NON_CHAT_ID = /embed|whisper|tts|dall-e|stable-diffusion|flux|rerank|moderation/i

/**
 * ¿Es un modelo de chat? Se decide por `mode` (embedding, image_generation, rerank... quedan fuera)
 * y, si LiteLLM no lo informa, por el nombre.
 */
export function isChatModel(id: string, info?: ModelMetadata): boolean {
  const mode = info?.mode?.toLowerCase()
  if (mode) return CHAT_MODES.has(mode)
  return !NON_CHAT_ID.test(id)
}

/** Modelo descubierto en LiteLLM -> entrada de config (`provider.<id>.models`). */
export function toConfigModel(id: string, info: ModelMetadata = {}): ConfigModel {
  const entry: ConfigModel = {
    name: typeof info.display_name === 'string' && info.display_name ? info.display_name : id,
  }
  if (info.max_input_tokens || info.max_output_tokens) {
    // 0 = desconocido: opencode usa entonces su valor por defecto.
    entry.limit = { context: info.max_input_tokens ?? 0, output: info.max_output_tokens ?? 0 }
  }
  if (info.supports_function_calling != null) entry.tool_call = info.supports_function_calling
  if (info.supports_vision || info.supports_pdf_input) entry.attachment = true

  // Solo si LiteLLM conoce el precio: omitirlo no es lo mismo que decir que el modelo es gratis.
  if (info.input_cost_per_token != null || info.output_cost_per_token != null) {
    entry.cost = {
      input: perMillion(info.input_cost_per_token ?? 0),
      output: perMillion(info.output_cost_per_token ?? 0),
    }
    if (info.cache_read_input_token_cost != null) {
      entry.cost.cache_read = perMillion(info.cache_read_input_token_cost)
    }
    if (info.cache_creation_input_token_cost != null) {
      entry.cost.cache_write = perMillion(info.cache_creation_input_token_cost)
    }
  }

  // Siempre explícitas: sin ellas opencode supone que un modelo desconocido acepta imágenes.
  const input = ['text']
  if (info.supports_vision) input.push('image')
  if (info.supports_pdf_input) input.push('pdf')
  if (info.supports_audio_input) input.push('audio')
  entry.modalities = { input, output: ['text'] }

  const efforts = info.reasoning_efforts
  if (info.supports_reasoning === true || (efforts?.length ?? 0) > 0) {
    entry.reasoning = true
    // Sin lista no se declaran variantes: opencode usa sus niveles por defecto. Con lista, se
    // declaran solo los que el modelo admite.
    if (efforts) {
      entry.variants = {}
      for (const effort of efforts) entry.variants[effort] = { reasoningEffort: effort }
    }
  }
  return entry
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Fusión profunda: los objetos se combinan campo a campo; el resto (incluidas listas) lo pisa `override`. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T
  }
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    result[key] = key in result ? deepMerge(result[key], value) : value
  }
  return result as T
}

/**
 * Parte de `value` que difiere de `base` (recursivo en objetos), o undefined si no difiere en nada.
 * Sirve para saber qué campos de un modelo declaró el usuario y cuáles son valores por defecto.
 */
export function diffFrom(value: unknown, base: unknown): unknown {
  if (isPlainObject(value) && isPlainObject(base)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const diff = diffFrom(item, base[key])
      if (diff !== undefined) result[key] = diff
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
  return JSON.stringify(value) === JSON.stringify(base) ? undefined : value
}

/** Igual que `Model.Info.default` de @opencode/schema (es un objeto plano: no hace falta importarlo). */
export function defaultV2Model(providerID: string, id: string): Model.Info {
  return {
    id: id as Model.Info['id'],
    modelID: id as Model.Info['modelID'],
    providerID: providerID as Model.Info['providerID'],
    name: id,
    capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: 'active',
    enabled: true,
    limit: { context: 200_000, output: 32_000 },
  }
}

/** Entrada de config (la que guarda la caché) -> `Model.Info` de opencode. */
export function toV2Model(providerID: string, id: string, entry: ConfigModel): Model.Info {
  const defaults = defaultV2Model(providerID, id)
  // opencode no añade niveles por defecto: con reasoning y sin lista, se declaran los mismos.
  const variants = entry.variants
    ? Object.entries(entry.variants)
        .filter(([, settings]) => settings.disabled !== true)
        .map(([variant, settings]) => ({ id: variant, settings }))
    : entry.reasoning
      ? DEFAULT_EFFORTS.map((effort) => ({ id: effort, settings: { reasoningEffort: effort } }))
      : []
  const cost = entry.cost
    ? [{
        input: entry.cost.input,
        output: entry.cost.output,
        cache: { read: entry.cost.cache_read ?? 0, write: entry.cost.cache_write ?? 0 },
      }]
    : []
  return {
    ...defaults,
    name: entry.name ?? id,
    capabilities: {
      tools: entry.tool_call ?? defaults.capabilities.tools,
      input: entry.modalities?.input ?? defaults.capabilities.input,
      output: entry.modalities?.output ?? defaults.capabilities.output,
    },
    // Los ids y precios son tipos "branded" (solo existen en TypeScript): en ejecución son string y number.
    variants: variants as unknown as Model.Info['variants'],
    cost: cost as unknown as Model.Info['cost'],
    limit: {
      context: entry.limit?.context || defaults.limit.context,
      output: entry.limit?.output || defaults.limit.output,
    },
  }
}
