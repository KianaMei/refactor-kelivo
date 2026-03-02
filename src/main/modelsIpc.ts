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
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause
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
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-opus-4-5-20251101',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022'
  ]
}

// ============================================================================
// OAuth 供应商静态模型列表（对齐 CPA model_definitions_static_data.go）
// ============================================================================

function getCodexOAuthModels(): string[] {
  return [
    'gpt-5',
    'gpt-5-codex',
    'gpt-5-codex-mini',
    'gpt-5.1',
    'gpt-5.1-codex',
    'gpt-5.1-codex-mini',
    'gpt-5.1-codex-max',
    'gpt-5.2',
    'gpt-5.2-codex',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark'
  ]
}

function getGeminiCLIOAuthModels(): string[] {
  return [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-preview',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3-pro-image-preview'
  ]
}

function getKimiOAuthModels(): string[] {
  return [
    'kimi-k2',
    'kimi-k2-thinking',
    'kimi-k2.5'
  ]
}

function getQwenOAuthModels(): string[] {
  return [
    'qwen3-coder-plus',
    'qwen3-coder-flash',
    'coder-model',
    'vision-model'
  ]
}

/** Antigravity：从 Google Cloud Code API 动态拉取模型列表 */
async function fetchAntigravityModels(accessToken: string): Promise<string[]> {
  const urls = [
    'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels'
  ]

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'antigravity/1.104.0'
        },
        body: '{}'
      })
      if (!resp.ok) continue

      const data = (await resp.json()) as { models?: Record<string, unknown> }
      if (!data.models || typeof data.models !== 'object') continue

      const skipSet = new Set(['chat_20706', 'chat_23310', 'gemini-2.5-flash-thinking', 'gemini-3-pro-low', 'gemini-2.5-pro'])
      return Object.keys(data.models).filter(k => !skipSet.has(k))
    } catch {
      continue
    }
  }

  // 如果都失败，返回默认列表
  return [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-high',
    'gemini-3-pro-image',
    'gemini-3.1-pro-high',
    'gemini-3-flash',
    'claude-sonnet-4-6',
    'claude-opus-4-6-thinking'
  ]
}

/** Google Gemini OAuth 模式：用 Bearer token 获取模型列表 */
async function fetchGoogleModelsWithBearer(provider: ProviderConfig, accessToken: string): Promise<string[]> {
  const baseUrl = provider.baseUrl.endsWith('/') ? provider.baseUrl.slice(0, -1) : provider.baseUrl
  const url = `${baseUrl}/models`

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  })

  if (!resp.ok) {
    // 如果 API 不支持模型列表，返回静态列表
    return getGeminiCLIOAuthModels()
  }

  const data = (await resp.json()) as Record<string, unknown>
  const rawList = Array.isArray(data?.models) ? data.models : []
  const ids = rawList
    .map((m: unknown) => {
      if (m && typeof m === 'object') {
        const obj = m as Record<string, unknown>
        const name = typeof obj.name === 'string' ? obj.name : ''
        return name.startsWith('models/') ? name.substring(7) : name
      }
      return ''
    })
    .filter((x: string) => x.trim().length > 0 && !x.includes('embedding'))

  return ids.length > 0 ? ids : getGeminiCLIOAuthModels()
}

const OAUTH_KINDS = new Set([
  'claude_oauth', 'codex_oauth', 'gemini_cli_oauth',
  'antigravity_oauth', 'kimi_oauth', 'qwen_oauth'
])

export function registerModelsIpc(): void {
  ipcMain.handle(IpcChannel.ModelsList, async (_event, params: ModelsListParams) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) throw new Error(`未找到供应商：${params.providerId}`)

    const kind = provider.providerType ?? 'openai'
    const isOAuth = OAUTH_KINDS.has(kind)

    // codex_oauth 支持双模式：有 accessToken 走 OAuth，否则降级到 API Key
    const codexUseApiKey = kind === 'codex_oauth'
      && !provider.oauthData?.accessToken
      && !!provider.apiKey

    // 认证前置检查
    if (isOAuth && !codexUseApiKey) {
      if (!provider.oauthData?.accessToken) {
        throw new Error('请先完成 OAuth 登录')
      }
    } else if (!isOAuth) {
      if (!provider.apiKey) throw new Error('该供应商未配置 API Key')
    }

    let ids: string[] = []

    switch (kind) {
      // --- OAuth 供应商 ---
      case 'claude_oauth':
        ids = getDefaultClaudeModels()
        break
      case 'codex_oauth':
        // API Key 模式：直接从第三方端点获取
        if (codexUseApiKey) {
          ids = await fetchOpenAIModels(provider)
        } else {
          ids = getCodexOAuthModels()
        }
        break
      case 'gemini_cli_oauth':
        ids = await fetchGoogleModelsWithBearer(provider, provider.oauthData!.accessToken)
        break
      case 'antigravity_oauth':
        ids = await fetchAntigravityModels(provider.oauthData!.accessToken)
        break
      case 'kimi_oauth':
        ids = getKimiOAuthModels()
        break
      case 'qwen_oauth':
        ids = getQwenOAuthModels()
        break
      // --- 传统供应商 ---
      case 'google':
        ids = await fetchGoogleModels(provider)
        break
      case 'claude':
        ids = await fetchClaudeModels(provider)
        break
      default:
        ids = await fetchOpenAIModels(provider)
        break
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
