import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverModels, loadModels, resolveBaseURL } from '../src/discovery'
import { BASE_URL, isolateCache, stubLiteLLM } from './helpers'

beforeEach(() => {
  isolateCache()
  vi.stubEnv('LITELLM_BASE_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('resolveBaseURL', () => {
  it('normaliza la URL del provider', () => {
    expect(resolveBaseURL('http://127.0.0.1:4000/v1/')).toBe(BASE_URL)
  })

  it('usa LITELLM_BASE_URL si el provider no tiene una válida', () => {
    vi.stubEnv('LITELLM_BASE_URL', 'http://127.0.0.1:4100')
    expect(resolveBaseURL(undefined)).toBe('http://127.0.0.1:4100')
    // "{env:LITELLM_BASE_URL}/v1" sustituido con la variable vacía.
    expect(resolveBaseURL('/v1')).toBe('http://127.0.0.1:4100')
  })

  it('sin ninguna, devuelve undefined', () => {
    expect(resolveBaseURL('/v1')).toBeUndefined()
  })
})

describe('discoverModels', () => {
  it('construye los modelos de chat y descarta embeddings y wildcards', async () => {
    const fetchMock = stubLiteLLM({
      '/v1/models': { data: [{ id: 'gpt' }, { id: 'kimi' }, { id: 'embed-small' }, { id: 'openai/*' }] },
      '/v1/model/info': {
        data: [
          { model_name: 'gpt', model_info: { mode: 'chat', display_name: 'GPT' } },
          { model_name: 'embed-small', model_info: { mode: 'embedding' } },
        ],
      },
    })
    const models = await discoverModels(BASE_URL, 'sk-test')
    expect(Object.keys(models)).toEqual(['gpt', 'kimi'])
    expect(models.gpt.name).toBe('GPT')
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/models`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
    }))
  })

  it('sin /v1/model/info sigue funcionando (sin metadatos)', async () => {
    stubLiteLLM({ '/v1/models': { data: [{ id: 'gpt' }] } })
    expect(await discoverModels(BASE_URL)).toEqual({
      gpt: { name: 'gpt', modalities: { input: ['text'], output: ['text'] } },
    })
  })

  it('lanza un error si /v1/models falla', async () => {
    stubLiteLLM(null)
    await expect(discoverModels(BASE_URL)).rejects.toThrow('fetch failed')
  })
})

describe('loadModels', () => {
  it('si LiteLLM cae, usa la última lista guardada', async () => {
    stubLiteLLM()
    const live = await loadModels('local_litellm', BASE_URL)
    expect(live?.source).toBe('live')

    stubLiteLLM(null)
    const cached = await loadModels('local_litellm', BASE_URL)
    expect(cached?.source).toBe('cache')
    expect(cached?.models).toEqual(live?.models)
  })

  it('sin LiteLLM ni caché devuelve null', async () => {
    stubLiteLLM(null)
    expect(await loadModels('local_litellm', BASE_URL)).toBeNull()
  })
})
