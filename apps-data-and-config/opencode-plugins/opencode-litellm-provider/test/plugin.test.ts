import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import plugin from '../src/index'
import { deepMerge, defaultV2Model } from '../src/model-mapping'
import { REFRESH_MIN_INTERVAL_MS } from '../src/plugin'
import { BASE_URL, isolateCache, liteLLMResponses, stubLiteLLM } from './helpers'

beforeEach(() => {
  isolateCache()
  vi.stubEnv('LITELLM_BASE_URL', '')
  vi.stubEnv('LITELLM_API_KEY', 'sk-env')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('exportación', () => {
  it('un único default con id y setup', () => {
    expect(Object.keys(plugin).sort()).toEqual(['id', 'setup'])
    expect(plugin.id).toBe('opencode-litellm-provider')
  })
})

/**
 * Host mínimo: en cada reload reconstruye el registro y aplica las transformaciones.
 * Por defecto el provider de la config aún no existe al transformar: opencode lo aplica después,
 * campo a campo, encima de lo que registre el plugin. Con preRegistered ya existe antes.
 */
function fakeV2Host(
  configuredModels: Record<string, Record<string, unknown>> = {},
  { preRegistered = false } = {},
) {
  const providerConfig = {
    id: 'local_litellm',
    name: 'Local LiteLLM',
    package: '@opencode/ai/providers/openai-compatible',
    settings: { litellm: true },
  }
  type RegistryRecord = { provider: Record<string, any>; models: Map<string, any> }
  let transform: ((editor: unknown) => void) | undefined
  let registry: RegistryRecord | undefined

  const rebuild = () => {
    let record: RegistryRecord | undefined = preRegistered
      ? {
          provider: structuredClone(providerConfig),
          models: new Map(Object.entries(configuredModels).map(([id, fields]) => [
            id,
            { ...defaultV2Model(providerConfig.id, id), ...fields },
          ])),
        }
      : undefined
    transform?.({
      get: (id: string) => (id === providerConfig.id ? record : undefined),
      add: ({ info, models }: { info: Record<string, any>; models: Array<{ id: string }> }) => {
        record = { provider: structuredClone(info), models: new Map(models.map((m) => [m.id, m])) }
      },
      update: (_id: string, fn: (provider: Record<string, any>) => void) => fn(record!.provider),
      models: { set: (_id: string, list: Array<{ id: string }>) => { record!.models = new Map(list.map((m) => [m.id, m])) } },
    })
    if (!preRegistered) {
      record ??= { provider: {}, models: new Map() }
      record.provider = deepMerge(record.provider, structuredClone(providerConfig))
      for (const [id, fields] of Object.entries(configuredModels)) {
        record.models.set(id, deepMerge(record.models.get(id) ?? defaultV2Model(providerConfig.id, id), fields))
      }
    }
    registry = record
  }

  // Canal de eventos: los test emiten y el plugin los consume con for await.
  const pending: unknown[] = []
  let wake: (() => void) | undefined
  const emit = (type: string) => { pending.push({ type, data: {} }); wake?.() }
  async function* subscribe({ signal }: { signal: AbortSignal }) {
    while (!signal.aborted) {
      while (pending.length) yield pending.shift()
      await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener('abort', () => resolve()) })
    }
  }

  const reload = vi.fn(async () => rebuild())
  const context = {
    provider: {
      list: async () => ({ data: [providerConfig] }),
      transform: async (callback: (editor: unknown) => void) => {
        transform = callback
        rebuild()
        return { dispose: async () => { transform = undefined } }
      },
      reload,
    },
    event: { subscribe },
  }
  return { context, reload, emit, registry: () => registry! }
}

describe('setup', () => {
  it('no hace nada si el host no expone la API de providers', async () => {
    expect(await plugin.setup({ catalog: {} } as never)).toBeUndefined()
  })

  it('registra el provider con los modelos descubiertos (la config se aplica después)', async () => {
    stubLiteLLM()
    vi.stubEnv('LITELLM_BASE_URL', BASE_URL)
    const host = fakeV2Host({ gpt: { name: 'Mi GPT' } })
    const cleanup = await plugin.setup(host.context as never)
    await vi.waitFor(() => expect(host.reload).toHaveBeenCalledTimes(1))

    const { provider, models } = host.registry()
    expect([...models.keys()].sort()).toEqual(['gpt', 'kimi'])
    expect(models.get('gpt')).toMatchObject({
      name: 'Mi GPT',
      limit: { context: 1000, output: 100 },
      variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'xhigh' }],
    })
    expect(models.get('kimi')).toMatchObject({ name: 'kimi', capabilities: { input: ['text'] } })
    // baseURL desde LITELLM_BASE_URL, al no venir en los settings de la config.
    expect(provider.settings.baseURL).toBe(`${BASE_URL}/v1`)
    await cleanup?.()
  })

  it('si el provider ya está registrado, aplica encima los campos fijados a mano', async () => {
    stubLiteLLM()
    vi.stubEnv('LITELLM_BASE_URL', BASE_URL)
    const host = fakeV2Host({ gpt: { name: 'Mi GPT' }, solo_config: { name: 'Solo en config' } }, { preRegistered: true })
    const cleanup = await plugin.setup(host.context as never)
    await vi.waitFor(() => expect(host.reload).toHaveBeenCalledTimes(1))

    const { provider, models } = host.registry()
    expect([...models.keys()].sort()).toEqual(['gpt', 'kimi', 'solo_config'])
    expect(models.get('gpt')).toMatchObject({ name: 'Mi GPT', limit: { context: 1000, output: 100 } })
    expect(provider.settings).toEqual({ baseURL: `${BASE_URL}/v1` })
    await cleanup?.()
  })

  it('en session.created vuelve a consultar LiteLLM (con throttle) y recarga si hay cambios', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    stubLiteLLM()
    vi.stubEnv('LITELLM_BASE_URL', BASE_URL)
    const host = fakeV2Host()
    const cleanup = await plugin.setup(host.context as never)
    await vi.waitFor(() => expect(host.reload).toHaveBeenCalledTimes(1))

    // Dentro del intervalo mínimo no se consulta.
    stubLiteLLM(liteLLMResponses(['gpt']))
    host.emit('session.created')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(host.reload).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + REFRESH_MIN_INTERVAL_MS + 1)
    host.emit('session.created')
    await vi.waitFor(() => expect(host.reload).toHaveBeenCalledTimes(2))
    expect([...host.registry().models.keys()]).toEqual(['gpt'])
    await cleanup?.()
  })
})
