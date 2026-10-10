// Enfoque (provider.transform + reload, reconciliación en provider.updated y refresco en
// session.created) tomado de yuseferi/opencode-litellm v1.4.2 (src/plugin/v2.ts), MIT © 2026 Yusef
// Mohamadi. Ver LICENSE y README.md (sección "Origen").

import type { Model, Plugin, Provider } from '@opencode/plugin'
import type { ProviderEditor } from '@opencode/plugin/promise/provider'
import { writeCache } from './cache'
import { discoverModels, isLiteLLMProvider, loadModels, resolveApiKey, resolveBaseURL } from './discovery'
import { errorMessage, fileLogWriter, log, setLogWriter } from './log'
import { deepMerge, defaultV2Model, diffFrom, toV2Model } from './model-mapping'
import type { ConfigModels } from './types'

type Context = Plugin.Context

/** No se vuelve a consultar LiteLLM más a menudo que esto aunque se abran muchas sesiones. */
export const REFRESH_MIN_INTERVAL_MS = 60_000

export interface ProviderState {
  id: string
  /** Datos del provider tal como los declara la config (de provider.list()). */
  info: Provider.Info
  baseURL: string
  apiKey?: string
  /** Modelos descubiertos, en el formato de config que guarda la caché. */
  models: ConfigModels
  /** Último descubrimiento en vivo (0 = nunca: se reintenta en la próxima sesión). */
  fetchedAt: number
  /** Modelos declarados a mano en la config y los campos que fijó el usuario. */
  manual?: Map<string, { original: Model.Info; overrides: Record<string, unknown> }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * Completa baseURL si falta y quita el marcador `litellm`, que no es un ajuste del paquete del provider.
 * (La config puede aplicarse después y volver a ponerlo; el paquete lo ignora.)
 */
export function cleanupLiteLLMSettings(
  settings: Record<string, unknown> | undefined,
  baseURL: string,
): Record<string, unknown> {
  const { litellm: _marker, ...rest } = settings ?? {}
  if (typeof rest.baseURL !== 'string' || !resolveBaseURL(rest.baseURL)) rest.baseURL = `${baseURL}/v1`
  return rest
}

/** Vuelve a consultar LiteLLM. Devuelve true si la lista de modelos cambió. */
export async function refreshState(state: ProviderState): Promise<boolean> {
  let models: ConfigModels
  try {
    models = await discoverModels(state.baseURL, state.apiKey)
  } catch (error) {
    log('warn', `No se pudo refrescar "${state.id}" desde ${state.baseURL}: ${errorMessage(error)}`)
    return false
  }
  state.fetchedAt = Date.now()
  writeCache(state.id, state.baseURL, models)
  if (JSON.stringify(models) === JSON.stringify(state.models)) return false
  state.models = models
  return true
}

/** Aplica el estado de un provider al registro de opencode (se ejecuta en cada reload). */
export function applyState(editor: ProviderEditor, state: ProviderState): void {
  const current = editor.get(state.id)
  if (!current) {
    // Los providers de la config pueden no estar aún en el editor: opencode los aplica después,
    // campo a campo, encima de lo que registre el plugin (también sus `models`, que así quedan
    // fusionados con lo descubierto). Se registra el provider con los modelos descubiertos.
    editor.add({
      info: { ...state.info, settings: cleanupLiteLLMSettings(state.info.settings, state.baseURL) },
      models: Object.entries(state.models).map(([id, entry]) => toV2Model(state.id, id, entry)),
    })
    log('debug', `${Object.keys(state.models).length} modelos publicados en "${state.id}".`)
    return
  }
  editor.update(state.id, (provider) => {
    provider.settings = cleanupLiteLLMSettings(provider.settings, state.baseURL)
  })

  // Si el provider ya está registrado (otro orden de carga en otras versiones), la fusión con la
  // config la hace el plugin: la primera vez se apuntan los modelos declarados a mano y qué campos fijó
  // el usuario (lo que difiere de los valores por defecto de opencode), y se aplican encima de lo descubierto.
  if (!state.manual) {
    state.manual = new Map()
    for (const [id, model] of current.models) {
      const overrides = asRecord(diffFrom(model, defaultV2Model(state.id, id)))
      state.manual.set(id, { original: model, overrides })
    }
  }

  const models: Model.Info[] = []
  for (const [id, entry] of Object.entries(state.models)) {
    const discovered = toV2Model(state.id, id, entry)
    const manual = state.manual.get(id)
    models.push(manual ? deepMerge(discovered, manual.overrides) : discovered)
  }
  for (const [id, manual] of state.manual) {
    if (!(id in state.models)) models.push(manual.original)
  }
  editor.models.set(state.id, models)
  log('debug', `${models.length} modelos publicados en "${state.id}".`)
}

/**
 * opencode: los providers de la config se registran después del setup de los plugins, así que se
 * reconcilia en cada `provider.updated`. Los modelos se inyectan con provider.transform y se publican
 * con provider.reload(); en cada `session.created` se vuelve a consultar LiteLLM (con throttle), de
 * modo que un modelo nuevo aparece en la siguiente sesión sin reiniciar.
 */
export async function setup(context: Context): Promise<(() => Promise<void>) | void> {
  // Sin la API de providers no hay nada que descubrir.
  if (!context?.provider?.transform || !context.event?.subscribe) return
  setLogWriter(fileLogWriter())

  const states = new Map<string, ProviderState>()
  const registration = await context.provider.transform((editor) => {
    for (const state of states.values()) applyState(editor, state)
  })

  // Tareas en serie: un provider que aparece a mitad de un descubrimiento no se procesa dos veces.
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch((error) => log('warn', `Error al sincronizar con LiteLLM: ${errorMessage(error)}`))
    return queue
  }

  const reconcile = async (): Promise<void> => {
    const { data } = await context.provider.list()
    let added = 0
    for (const provider of data) {
      if (states.has(provider.id)) continue
      const settings = asRecord(provider.settings)
      if (!isLiteLLMProvider(settings)) continue
      const baseURL = resolveBaseURL(settings.baseURL)
      if (!baseURL) {
        log('warn', `"${provider.id}" no tiene baseURL ni LITELLM_BASE_URL: no se descubren modelos.`)
        continue
      }
      const apiKey = resolveApiKey(settings.apiKey)
      const result = await loadModels(provider.id, baseURL, apiKey)
      states.set(provider.id, {
        id: provider.id,
        info: provider as unknown as Provider.Info, // mismo objeto; solo cambia el tipo "branded" del id
        baseURL,
        apiKey,
        models: result?.models ?? {},
        // Si vino de la caché (o no hubo nada), se reintenta en la próxima sesión.
        fetchedAt: result?.source === 'live' ? result.savedAt : 0,
      })
      added++
    }
    if (added > 0) await context.provider.reload()
  }

  const refresh = async (): Promise<void> => {
    let changed = false
    for (const state of states.values()) {
      if (Date.now() - state.fetchedAt < REFRESH_MIN_INTERVAL_MS) continue
      if (await refreshState(state)) changed = true
    }
    if (changed) {
      await context.provider.reload()
      log('info', 'Lista de modelos de LiteLLM actualizada.')
    }
  }

  const controller = new AbortController()
  void (async () => {
    try {
      for await (const event of context.event.subscribe({ signal: controller.signal })) {
        if (event.type === 'provider.updated') {
          void enqueue(reconcile)
        } else if (event.type === 'session.created') {
          void enqueue(reconcile)
          void enqueue(refresh)
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) log('warn', `Suscripción a eventos interrumpida: ${errorMessage(error)}`)
    }
  })()
  // Por si el provider se registró antes de suscribirse a los eventos.
  void enqueue(reconcile)

  return async () => {
    controller.abort()
    await registration.dispose()
  }
}
