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

export function registerModelsIpc(): void {
  ipcMain.handle(IpcChannel.ModelsList, async (_event, params: ModelsListParams) => {
    const cfg = await loadConfig()
    const provider = cfg.providerConfigs[params.providerId]
    if (!provider) throw new Error(`未找到供应商：${params.providerId}`)

    const kind = provider.providerType ?? 'openai'
    // 旧版里 OpenAI/Gemini/Claude 各有不同接口；这里先把 openai-compatible 拉通。
    if (kind !== 'openai') {
      throw new Error(`当前暂不支持该供应商类型的模型列表获取：${kind}`)
    }

    if (!provider.apiKey) throw new Error('该供应商未配置 API Key')

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
          const u = new URL(url)
          return u.origin
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

    const data = (await resp.json()) as any
    const rawList = Array.isArray(data?.data) ? data.data : []
    const ids = rawList
      .map((m: any) => (typeof m?.id === 'string' ? m.id : typeof m?.name === 'string' ? m.name : null))
      .filter((x: any) => typeof x === 'string' && x.trim().length > 0) as string[]

    const uniq = Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))

    // 推断每个模型的能力
    const modelInfos = uniq.map(id => inferModelCapabilities(id))

    const result: ModelsListResult = {
      providerId: params.providerId,
      models: uniq,
      modelInfos
    }
    return result
  })
}
