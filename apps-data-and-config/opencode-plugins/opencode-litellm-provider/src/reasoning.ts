// Derivado de yuseferi/opencode-litellm v1.4.2 (src/utils/reasoning-efforts.ts), MIT © 2026 Yusef Mohamadi.
// Ver LICENSE y README.md (sección "Origen").

import type { LiteLLMModelInfo } from './types'

/** Orden de presentación de los niveles de esfuerzo conocidos. */
export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

// Restricciones de proveedor que los flags de LiteLLM no reflejan bien. Solo acotan lo inferido:
// una lista explícita del deployment siempre manda.
// https://developers.openai.com/api/docs/models/gpt-5-pro (y gpt-5.2-pro, gpt-5.4-pro)
const RESTRICTED_EFFORTS = new Map<string, readonly string[]>([
  ['gpt-5-pro', ['high']],
  ['gpt-5.2-pro', ['medium', 'high', 'xhigh']],
  ['gpt-5.4-pro', ['medium', 'high', 'xhigh']],
])

function restrictedEfforts(...identifiers: unknown[]): readonly string[] | undefined {
  for (const identifier of identifiers) {
    if (typeof identifier !== 'string') continue
    // Las claves pueden llevar prefijo de proveedor/región o fecha de snapshot.
    const model = identifier.split('/').pop()?.replace(/-\d{4}-\d{2}-\d{2}$/, '')
    const efforts = model ? RESTRICTED_EFFORTS.get(model) : undefined
    if (efforts) return efforts
  }
  return undefined
}

/**
 * Niveles de `reasoning_effort` que admite un modelo, a partir de su model_info (y de litellm_params,
 * que rellena huecos). Devuelve:
 *   - una lista (posiblemente vacía) si LiteLLM da información suficiente;
 *   - undefined si no la hay (opencode aplica entonces sus niveles por defecto).
 */
export function resolveReasoningEfforts(
  info: LiteLLMModelInfo,
  params?: Record<string, unknown>,
): string[] | undefined {
  const metadata: Record<string, unknown> = { ...params }
  for (const [key, value] of Object.entries(info)) {
    if (value != null) metadata[key] = value
  }

  if (metadata.supports_reasoning === false) return []

  // Las listas explícitas mandan, incluida una vacía.
  for (const key of ['reasoning_effort_levels', 'supports_reasoning_efforts']) {
    const levels = metadata[key]
    if (Array.isArray(levels)) {
      return [...new Set(levels.filter((level): level is string => typeof level === 'string'))]
    }
  }

  // Si el modelo no acepta el parámetro (ni en chat ni en la Responses API), no hay niveles.
  const supportedParams = metadata.supported_openai_params
  if (
    Array.isArray(supportedParams) &&
    !supportedParams.includes('reasoning_effort') &&
    !supportedParams.includes('reasoning')
  ) return []

  const flags = new Map<string, boolean>()
  for (const [key, value] of Object.entries(metadata)) {
    const match = key.match(/^supports_([a-z]+)_reasoning_effort$/)
    if (match && typeof value === 'boolean') flags.set(match[1], value)
  }
  if (flags.size === 0) return undefined
  // Los flags negativos solo descartan niveles; no demuestran que el modelo razone.
  if (metadata.supports_reasoning !== true && ![...flags.values()].includes(true)) return undefined

  // Los flags de LiteLLM son dispersos: medium/high no tienen flag propio y low es opt-out.
  // Los niveles opcionales (none, minimal, xhigh, max...) necesitan un true explícito.
  const efforts = new Set<string>()
  for (const effort of ['low', 'medium', 'high']) {
    if (flags.get(effort) !== false) efforts.add(effort)
  }
  for (const [effort, supported] of flags) {
    if (supported) efforts.add(effort)
  }

  const restricted = restrictedEfforts(metadata.key, params?.model)
  if (restricted) {
    for (const effort of efforts) {
      if (!restricted.includes(effort)) efforts.delete(effort)
    }
  }

  return [
    ...EFFORT_ORDER.filter((effort) => efforts.has(effort)),
    ...[...efforts].filter((effort) => !EFFORT_ORDER.includes(effort)),
  ]
}
