// Casos portados de yuseferi/opencode-litellm v1.4.2 (test/litellm-api.test.ts), MIT © 2026 Yusef Mohamadi.
import { describe, expect, it } from 'vitest'
import { resolveReasoningEfforts } from '../src/reasoning'

const astra = {
  key: 'bedrock_mantle/openai.gpt-6-astra',
  supports_reasoning: true,
  supports_max_reasoning_effort: true,
  supports_xhigh_reasoning_effort: true,
  supports_none_reasoning_effort: false,
  supports_minimal_reasoning_effort: false,
  supports_low_reasoning_effort: null,
  reasoning_effort_levels: null,
}

const pro = {
  supports_reasoning: true,
  supports_none_reasoning_effort: false,
  supports_minimal_reasoning_effort: true,
  supports_xhigh_reasoning_effort: true,
  reasoning_effort_levels: null,
}

describe('resolveReasoningEfforts', () => {
  it.each([
    { name: 'recupera los niveles base con flags dispersos', info: astra, params: {}, expected: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { name: 'lee flags de litellm_params', info: { supports_reasoning: true }, params: astra, expected: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { name: 'una lista explícita manda', info: { ...astra, reasoning_effort_levels: ['low', 'high', 'max'] }, params: {}, expected: ['low', 'high', 'max'] },
    { name: 'una lista explícita vacía manda', info: { ...astra, reasoning_effort_levels: [] }, params: {}, expected: [] },
    { name: 'model_info false gana a params true', info: { ...astra, supports_low_reasoning_effort: false, supports_xhigh_reasoning_effort: false }, params: { supports_low_reasoning_effort: true, supports_xhigh_reasoning_effort: true }, expected: ['medium', 'high', 'max'] },
    { name: 'no inventa niveles sin metadatos de esfuerzo', info: { supports_reasoning: true }, params: {}, expected: undefined },
    { name: 'no inventa niveles en modelos desconocidos', info: {}, params: {}, expected: undefined },
    { name: 'flags solo negativos no implican razonamiento', info: { supports_none_reasoning_effort: false, supports_xhigh_reasoning_effort: false }, params: {}, expected: undefined },
    { name: 'sin reasoning_effort en supported_openai_params no hay niveles', info: { supports_minimal_reasoning_effort: true, supported_openai_params: ['max_tokens', 'stream'] }, params: {}, expected: [] },
    { name: 'acepta el parámetro de la Responses API', info: { ...astra, supported_openai_params: ['reasoning'] }, params: {}, expected: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { name: 'supports_reasoning false lo anula todo', info: { ...astra, supports_reasoning: false, reasoning_effort_levels: ['high'] }, params: { supports_reasoning: true }, expected: [] },
    { name: 'none y minimal explícitos, en orden', info: { supports_minimal_reasoning_effort: true, supports_none_reasoning_effort: true }, params: {}, expected: ['none', 'minimal', 'low', 'medium', 'high'] },
    { name: 'filtra miembros inválidos y duplicados', info: { reasoning_effort_levels: ['high', null, 1, 'high', 'low'] }, params: {}, expected: ['high', 'low'] },
    { name: 'GPT-5.4 Pro: solo sus niveles', info: { ...pro, key: 'gpt-5.4-pro', supports_minimal_reasoning_effort: false }, params: {}, expected: ['medium', 'high', 'xhigh'] },
    { name: 'GPT-5 Pro: solo high', info: { ...pro, key: 'gpt-5-pro', supports_xhigh_reasoning_effort: false }, params: {}, expected: ['high'] },
    { name: 'reconoce el modelo real tras un alias de deployment', info: { ...pro, key: 'company-reasoner' }, params: { model: 'openai/gpt-5-pro-2025-10-06' }, expected: ['high'] },
    { name: 'no restringe GPT-5.4 normal', info: { ...pro, key: 'gpt-5.4' }, params: {}, expected: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
  ])('$name', ({ info, params, expected }) => {
    expect(resolveReasoningEfforts(info as never, params)).toEqual(expected)
  })
})
