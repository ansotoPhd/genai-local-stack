import { describe, expect, it } from 'vitest'
import {
  deepMerge,
  defaultV2Model,
  diffFrom,
  isChatModel,
  toConfigModel,
  toV2Model,
} from '../src/model-mapping'

describe('isChatModel', () => {
  it('decide por mode cuando LiteLLM lo informa', () => {
    expect(isChatModel('x', { mode: 'chat' })).toBe(true)
    expect(isChatModel('x', { mode: 'responses' })).toBe(true)
    expect(isChatModel('x', { mode: 'embedding' })).toBe(false)
    expect(isChatModel('x', { mode: 'rerank' })).toBe(false)
  })

  it('sin mode, decide por el nombre', () => {
    expect(isChatModel('openrouter-kimi-k3')).toBe(true)
    expect(isChatModel('openai-text-embedding-3-small')).toBe(false)
    expect(isChatModel('whisper-1')).toBe(false)
  })
})

describe('toConfigModel', () => {
  it('mapea límites, capacidades, precios y variantes', () => {
    const entry = toConfigModel('openai-gpt-6-luna', {
      display_name: 'GPT-6 Luna (OpenAI)',
      max_input_tokens: 922000,
      max_output_tokens: 128000,
      supports_function_calling: true,
      supports_vision: true,
      supports_pdf_input: true,
      supports_reasoning: true,
      input_cost_per_token: 1e-7,
      output_cost_per_token: 5e-7,
      cache_read_input_token_cost: 1e-8,
      reasoning_efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    })
    expect(entry).toEqual({
      name: 'GPT-6 Luna (OpenAI)',
      limit: { context: 922000, output: 128000 },
      tool_call: true,
      attachment: true,
      cost: { input: 0.1, output: 0.5, cache_read: 0.01 },
      modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
      reasoning: true,
      variants: {
        none: { reasoningEffort: 'none' },
        low: { reasoningEffort: 'low' },
        medium: { reasoningEffort: 'medium' },
        high: { reasoningEffort: 'high' },
        xhigh: { reasoningEffort: 'xhigh' },
      },
    })
  })

  it('sin metadatos: nombre = id, solo texto y sin precio', () => {
    expect(toConfigModel('mi-modelo')).toEqual({
      name: 'mi-modelo',
      modalities: { input: ['text'], output: ['text'] },
    })
  })

  it('declara solo los niveles de razonamiento que informa LiteLLM', () => {
    const entry = toConfigModel('pro', { supports_reasoning: true, reasoning_efforts: ['high'] })
    expect(entry.variants).toEqual({ high: { reasoningEffort: 'high' } })
  })

  it('razonamiento sin lista de niveles: sin variantes', () => {
    const entry = toConfigModel('haiku', { supports_reasoning: true })
    expect(entry.reasoning).toBe(true)
    expect(entry.variants).toBeUndefined()
  })

  it('conserva un tool_call false explícito', () => {
    expect(toConfigModel('x', { supports_function_calling: false }).tool_call).toBe(false)
  })
})

describe('fusión con lo declarado a mano', () => {
  it('deepMerge combina objetos y pisa el resto', () => {
    expect(deepMerge({ a: 1, b: { c: 1, d: [1] } }, { b: { c: 2, d: [2, 3] }, e: true })).toEqual({
      a: 1,
      b: { c: 2, d: [2, 3] },
      e: true,
    })
  })

  it('diffFrom devuelve solo lo que difiere de los valores por defecto', () => {
    const configured = { ...defaultV2Model('p', 'm'), name: 'Mi modelo', limit: { context: 500, output: 32_000 } }
    expect(diffFrom(configured, defaultV2Model('p', 'm'))).toEqual({ name: 'Mi modelo', limit: { context: 500 } })
    expect(diffFrom(defaultV2Model('p', 'm'), defaultV2Model('p', 'm'))).toBeUndefined()
  })
})

describe('toV2Model', () => {
  it('convierte la entrada de config al Model.Info de opencode', () => {
    const model = toV2Model('local_litellm', 'm', toConfigModel('m', {
      display_name: 'M',
      max_input_tokens: 1000,
      max_output_tokens: 100,
      supports_function_calling: false,
      supports_vision: true,
      supports_reasoning: true,
      input_cost_per_token: 1e-6,
      output_cost_per_token: 2e-6,
      reasoning_efforts: ['high'],
    }))
    expect(model).toMatchObject({
      id: 'm',
      modelID: 'm',
      providerID: 'local_litellm',
      name: 'M',
      capabilities: { tools: false, input: ['text', 'image'], output: ['text'] },
      variants: [{ id: 'high', settings: { reasoningEffort: 'high' } }],
      cost: [{ input: 1, output: 2, cache: { read: 0, write: 0 } }],
      limit: { context: 1000, output: 100 },
      enabled: true,
    })
  })

  it('razonamiento sin lista: declara low/medium/high', () => {
    const model = toV2Model('p', 'm', toConfigModel('m', { supports_reasoning: true }))
    expect(model.variants.map((variant) => variant.id)).toEqual(['low', 'medium', 'high'])
  })

  it('sin límites conocidos usa los valores por defecto de opencode', () => {
    expect(toV2Model('p', 'm', toConfigModel('m')).limit).toEqual({ context: 200_000, output: 32_000 })
  })
})
