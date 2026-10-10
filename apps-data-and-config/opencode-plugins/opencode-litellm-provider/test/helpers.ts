import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

export const BASE_URL = 'http://127.0.0.1:4000'

/** Respuestas de un LiteLLM falso: un modelo de chat conocido, uno sin metadatos y un embedding. */
export function liteLLMResponses(ids = ['gpt', 'kimi', 'embed-small']) {
  const info = [
    {
      model_name: 'gpt',
      litellm_params: { model: 'openai/gpt' },
      model_info: {
        mode: 'chat',
        display_name: 'GPT',
        max_input_tokens: 1000,
        max_output_tokens: 100,
        supports_reasoning: true,
        supports_xhigh_reasoning_effort: true,
        supported_openai_params: ['reasoning_effort'],
      },
    },
    { model_name: 'kimi', litellm_params: { model: 'openrouter/kimi' }, model_info: { max_input_tokens: 2000 } },
    { model_name: 'embed-small', litellm_params: { model: 'openai/embed' }, model_info: { mode: 'embedding' } },
  ]
  return {
    '/v1/models': { data: ids.map((id) => ({ id, object: 'model' })) },
    '/v1/model/info': { data: info.filter((entry) => ids.includes(entry.model_name)) },
  }
}

/** Sustituye fetch por un LiteLLM falso (o por uno caído si `responses` es null). */
export function stubLiteLLM(responses: Record<string, unknown> | null = liteLLMResponses()) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    if (!responses) throw new TypeError('fetch failed')
    const path = new URL(String(url)).pathname
    if (!(path in responses)) return new Response('not found', { status: 404 })
    return Response.json(responses[path])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Caché aislada por test. */
export function isolateCache(): string {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-litellm-provider-'))
  vi.stubEnv('XDG_CACHE_HOME', dir)
  return dir
}
