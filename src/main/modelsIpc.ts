import { ipcMain } from 'electron'

import { IpcChannel } from '../shared/ipc'
import type { ModelsListParams, ModelsListResult, ModelInfo, Modality, ModelAbility } from '../shared/models'
import { loadConfig } from './configStore'
import { joinUrl, safeReadText } from './http'

// ============================================================================
// 模型能力推断（对齐 Flutter ModelRegistry）
// ============================================================================

// 支持视觉输入的模型
const VISION_REGEX = /(gpt-4o|gpt-4-1|o\d|gemini|claude|doubao-1\.6|grok-4|step-3|intern-s1)/i

// 支持工具调用的模型
const TOOL_REGEX = /(gpt-4o|gpt-4-1|gpt-oss|gpt-5|o\d|gemini|claude|qwen-3|doubao-1\.6|grok-4|kimi-k2|step-3|intern-s1|glm-4\.5|deepseek-r1|deepseek-v3)/i

// 支持推理/思考的模型
const REASONING_REGEX = /(gpt-oss|o\d|gemini-(2\.5|3)|gemini-(flash|pro)-latest|claude|qwen|doubao-1\.6|grok-4|step-3|intern-s1|glm-4\.5|deepseek-r1|gpt-5)/i

function inferModelCapabilities(modelId: string): ModelInfo {
  const id = modelId.toLowerCase()
  const input: Modality[] = ['text']
  const output: Modality[] = ['text']
  const abilities: ModelAbility[] = []

  // 图像生成模型
  if (id.includes('image') || id.includes('dall-e') || id.includes('imagen')) {
    input.push('image')
    output.push('image')
    return {
      id: modelId,
      displayName: modelId,
      type: 'chat',
      input,
      output,
      abilities: [] // 图像模型通常没有 tool/reasoning
    }
  }

  // Embedding 模型
  if (id.includes('embedding') || id.includes('embed')) {
    return {
      id: modelId,
      displayName: modelId,
      type: 'embedding',
      input: ['text'],
      output: ['text'],
      abilities: []
    }
  }

  // 视觉输入
  if (VISION_REGEX.test(id)) {
    if (!input.includes('image')) input.push('image')
  }

  // 工具调用能力
  if (TOOL_REGEX.test(id)) {
    abilities.push('tool')
  }

  // 推理能力
  if (REASONING_REGEX.test(id)) {
    abilities.push('reasoning')
  }

  return {
    id: modelId,
    displayName: modelId,
    type: 'chat',
    input,
    output,
    abilities
  }
}

function formatFetchError(err: unknown): string {
  if (!err) return 'unknown'
  if (err instanceof Error) {
    const parts: string[] = []
    if (err.message) parts.push(err.message)
    const cause: any = (err as any).cause
    if (cause) {
      if (typeof cause.code === 'string' && cause.code) parts.push(cause.code)
      if (typeof cause.message === 'string' && cause.message && cause.message !== err.message) parts.push(cause.message)
    }
    return parts.join(' / ') || 'unknown'
  }
  return String(err)
}

// ============================================================================
// 模型列表获取函数
// ============================================================================

interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  vertexAI?: boolean
  projectId?: string
  location?: string
}

/** 获取 OpenAI 兼容 API 的模型列表 */
async function fetchOpenAIModels(provider: ProviderConfig): Promise<string[]> {
  const url = joinUrl(provider.baseUrl, '/models')
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        Accept: 'application/json'
      }
    })
  } catch (e) {
    const safeHost = (() => {
      try {
        return new URL(url).origin
      } catch {
        return provider.baseUrl
      }
    })()
    throw new Error(`获取模型列表失败（${provider.name} · ${safeHost}）：${formatFetchError(e)}`)
  }

  if (!resp.ok) {
    const text = await safeReadText(resp)
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as Record<string, unknown>
  const rawList = Array.isArray(data?.data) ? data.data : []
  return rawList
    .map((m: unknown) => {
      if (m && typeof m === 'object') {
        const obj = m as Record<string, unknown>
        if (typeof obj.id === 'string') return obj.id
        if (typeof obj.name === 'string') return obj.name
      }
      return null
    })
    .filter((x: unknown) => typeof x === 'string' && (x as string).trim().length > 0) as string[]
}

/** 获取 Google Gemini API 的模型列表 */
async function fetchGoogleModels(provider: ProviderConfig): Promise<string[]> {
  // Google Gemini API: GET /models?key=API_KEY
  const baseUrl = provider.baseUrl.endsWith('/') ? provider.baseUrl.slice(0, -1) : provider.baseUrl
  const url = `${baseUrl}/models?key=${provider.apiKey}`

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    })
  } catch (e) {
    throw new Error(`获取模型列表失败（${provider.name}）：${formatFetchError(e)}`)
  }

  if (!resp.ok) {
    const text = await safeReadText(resp)
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as Record<string, unknown>
  // Google 返回 { models: [{ name: "models/gemini-pro", ... }] }
  const rawList = Array.isArray(data?.models) ? data.models : []
  return rawList
    .map((m: unknown) => {
      if (m && typeof m === 'object') {
        const obj = m as Record<string, unknown>
        const name = typeof obj.name === 'string' ? obj.name : ''
        return name.startsWith('models/') ? name.substring(7) : name
      }
      return ''
    })
    .filter((x: string) => x.trim().length > 0 && !x.includes('embedding'))
}

/** 获取 Anthropic Claude API 的模型列表 */
async function fetchClaudeModels(provider: ProviderConfig): Promise<string[]> {
  // Claude API: GET /models (with x-api-key header)
  const url = joinUrl(provider.baseUrl, '/models')

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        Accept: 'application/json'
      }
    })
  } catch (e) {
    throw new Error(`获取模型列表失败（${provider.name}）：${formatFetchError(e)}`)
  }

  if (!resp.ok) {
    // Claude 可能不支持 /models 端点，返回默认列表
    if (resp.status === 404) {
      return getDefaultClaudeModels()
    }
    const text = await safeReadText(resp)
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as Record<string, unknown>
  // Claude 返回 { data: [{ id: "claude-3-opus-...", ... }] }
  const rawList = Array.isArray(data?.data) ? data.data : []
  const ids = rawList
    .map((m: unknown) => {
      if (m && typeof m === 'object') {
        const obj = m as Record<string, unknown>
        if (typeof obj.id === 'string') return obj.id
      }
      return null
    })
    .filter((x: unknown) => typeof x === 'string' && (x as string).trim().length > 0) as string[]

  // 如果没有获取到模型，返回默认列表
  return ids.length > 0 ? ids : getDefaultClaudeModels()
}

/** Claude 默认模型列表 */
function getDefaultClaudeModels(): string[] {
  return [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ]
}

export function registerModelsIpc(): void {
  ipcMain.handle(IpcChannel.ModelsList, async (_event, params: ModelsListParams) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) throw new Error(`未找到供应商：${params.providerId}`)

    const kind = provider.providerType ?? 'openai'
    if (!provider.apiKey) throw new Error('该供应商未配置 API Key')

    let ids: string[] = []
    if (kind === 'google') {
      ids = await fetchGoogleModels(provider)
    } else if (kind === 'claude') {
      ids = await fetchClaudeModels(provider)
    } else {
      ids = await fetchOpenAIModels(provider)
    }

    const uniq = Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
    const modelInfos = uniq.map(id => inferModelCapabilities(id))

    const result: ModelsListResult = {
      providerId: params.providerId,
      models: uniq,
      modelInfos
    }
    return result
  })

  ipcMain.handle(IpcChannel.ModelsTestFetch, async (_event, params: { providerType: string; baseUrl: string; apiKey: string }) => {
    if (!params.apiKey) throw new Error('API Key 不能为空')

    const tempConfig: ProviderConfig = {
      name: 'TestProvider',
      baseUrl: params.baseUrl,
      apiKey: params.apiKey
    }

    let ids: string[] = []
    if (params.providerType === 'google') {
      ids = await fetchGoogleModels(tempConfig)
    } else if (params.providerType === 'claude' || params.providerType === 'anthropic') {
      ids = await fetchClaudeModels(tempConfig)
    } else {
      // 默认走 openai 兼容
      ids = await fetchOpenAIModels(tempConfig)
    }

    const uniq = Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
    const modelInfos = uniq.map(id => inferModelCapabilities(id))

    const result: ModelsListResult = {
      providerId: 'test',
      models: uniq,
      modelInfos
    }
    return result
  })
}
