/**
 * Chat API Helper
 * 配置和工具方法，供各 Provider Adapter 使用
 */

import type { ProviderConfigV2, ProviderKind } from '../../../shared/types'
import type { ToolResultInfo } from '../../../shared/chatStream'
import * as fs from 'fs'
import * as path from 'path'

// ========== Reasoning Effort Level Constants ==========
// 这些负值表示 effort level，存储在设置/对话中
// 正值是原始 token 数 (向后兼容)
export const EFFORT_AUTO = -1
export const EFFORT_OFF = 0
export const EFFORT_MINIMAL = -10
export const EFFORT_LOW = -20
export const EFFORT_MEDIUM = -30
export const EFFORT_HIGH = -40

export const EFFORT_LEVELS = [EFFORT_AUTO, EFFORT_OFF, EFFORT_MINIMAL, EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH]

// ========== Model ID Resolution ==========

/**
 * 解析上游/厂商的模型 ID
 * 当 per-instance overrides 指定了 apiModelId 时，使用该值
 */
export function apiModelId(cfg: ProviderConfigV2, modelId: string): string {
  try {
    const ov = cfg.modelOverrides[modelId]
    if (ov && typeof ov === 'object') {
      const raw = ((ov as Record<string, unknown>)['apiModelId'] ?? (ov as Record<string, unknown>)['api_model_id'])
      if (typeof raw === 'string' && raw.trim()) return raw.trim()
    }
  } catch {
    // ignore
  }
  return modelId
}

// ========== API Key Management ==========

/**
 * 获取有效的 API Key，考虑多 Key 轮询
 */
export function effectiveApiKey(cfg: ProviderConfigV2): string {
  // TODO: 实现多 Key 轮询逻辑
  // 目前简单返回主 Key
  return cfg.apiKey
}

/**
 * 获取请求使用的 API Key
 */
export function apiKeyForRequest(cfg: ProviderConfigV2, modelId: string): string {
  const orig = effectiveApiKey(cfg).trim()
  if (orig) return orig
  // 可以添加特定 provider 的 fallback 逻辑
  return orig
}

// ========== Model Overrides ==========

/**
 * 获取 per-model override map
 */
export function modelOverride(cfg: ProviderConfigV2, modelId: string): Record<string, unknown> {
  const ov = cfg.modelOverrides[modelId]
  if (ov && typeof ov === 'object') return ov as Record<string, unknown>
  return {}
}

/**
 * 读取模型配置的内置工具 (如 ['search', 'url_context'])
 */
export function builtInTools(cfg: ProviderConfigV2, modelId: string): Set<string> {
  try {
    const ov = modelOverride(cfg, modelId)
    const raw = ov['builtInTools']
    if (Array.isArray(raw)) {
      return new Set(raw.map((e) => String(e).trim().toLowerCase()).filter((e) => e))
    }
  } catch {
    // ignore
  }
  return new Set()
}

/**
 * 获取模型配置的自定义请求头
 */
export function customHeaders(cfg: ProviderConfigV2, modelId: string): Record<string, string> {
  const ov = modelOverride(cfg, modelId)
  const list = (ov['headers'] as Array<{ name?: string; key?: string; value?: string }>) ?? []
  const out: Record<string, string> = {}
  for (const e of list) {
    const name = (e.name ?? e.key ?? '').trim()
    const value = e.value ?? ''
    if (name) out[name] = value
  }
  return out
}

/**
 * 获取模型配置的自定义请求体参数
 */
export function customBody(cfg: ProviderConfigV2, modelId: string): Record<string, unknown> {
  const ov = modelOverride(cfg, modelId)
  const list = (ov['body'] as Array<{ key?: string; name?: string; value?: string }>) ?? []
  const out: Record<string, unknown> = {}
  for (const e of list) {
    const key = (e.key ?? e.name ?? '').trim()
    const val = e.value ?? ''
    if (key) out[key] = parseOverrideValue(val)
  }
  return out
}

/**
 * 解析 override value 字符串到适当的类型
 */
export function parseOverrideValue(v: string): unknown {
  const s = v.trim()
  if (!s) return s
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  const i = parseInt(s, 10)
  if (!isNaN(i) && String(i) === s) return i
  const d = parseFloat(s)
  if (!isNaN(d) && String(d) === s) return d
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s)
    } catch {
      // ignore
    }
  }
  return v
}

// ========== Reasoning Budget ==========

/**
 * 检查 reasoning 是否禁用
 */
export function isReasoningOff(budget: number | undefined): boolean {
  return budget !== undefined && budget === 0
}

/**
 * 获取 reasoning effort level 名称
 */
export function effortLevelName(value: number): string {
  switch (value) {
    case EFFORT_AUTO:
      return 'auto'
    case EFFORT_OFF:
      return 'off'
    case EFFORT_MINIMAL:
      return 'minimal'
    case EFFORT_LOW:
      return 'low'
    case EFFORT_MEDIUM:
      return 'medium'
    case EFFORT_HIGH:
      return 'high'
    default:
      return 'auto' // 正值视为 auto
  }
}

/**
 * 检查值是否是 effort level (负数) vs raw budget (正数)
 */
export function isEffortLevel(value: number | undefined): boolean {
  return value !== undefined && (value < 0 || value === 0)
}

/**
 * 获取模型的最大 thinking budget
 */
export function getModelMaxThinkingBudget(modelId: string): number {
  const m = modelId.toLowerCase()
  // Claude models
  if (m.includes('opus') || m.includes('sonnet')) return 64000
  if (m.includes('claude')) return 32000
  // Gemini 2.5 models
  if (m.includes('gemini-2.5-pro') || m.includes('2.5-pro')) return 32768
  if (m.includes('gemini-2.5-flash') || m.includes('2.5-flash')) return 24576
  // Gemini 3 models
  if (m.includes('gemini-3') || m.includes('gemini-3.0')) return 32768
  // DeepSeek
  if (m.includes('deepseek')) return 32768
  // OpenAI o-series
  if (m.includes('o1') || m.includes('o3') || m.includes('o4')) return 100000
  // Default
  return 32768
}

/**
 * 将存储的 effort level 转换为实际的 budget tokens
 */
export function effortToBudget(storedValue: number | undefined, modelId: string): number {
  // null 或 auto -> -1 (让模型决定)
  if (storedValue === undefined || storedValue === EFFORT_AUTO) return -1
  // off -> 0
  if (storedValue === EFFORT_OFF) return 0
  // 正值 = raw budget (向后兼容)
  if (storedValue > 0) return storedValue

  // effort level -> 根据模型 max 计算
  const max = getModelMaxThinkingBudget(modelId)
  switch (storedValue) {
    case EFFORT_MINIMAL:
      return Math.max(128, Math.min(max, Math.round(max * 0.03))) // 3%
    case EFFORT_LOW:
      return Math.max(128, Math.min(max, Math.round(max * 0.1))) // 10%
    case EFFORT_MEDIUM:
      return Math.round(max * 0.33) // 33%
    case EFFORT_HIGH:
      return max // 100%
    default:
      return -1
  }
}

/**
 * 获取 budget 对应的 reasoning effort 字符串
 */
export function effortForBudget(budget: number | undefined): string {
  if (budget === undefined || budget === -1) return 'auto'
  if (budget === 0) return 'off'
  // 处理 effort level 常量
  if (budget === EFFORT_MINIMAL) return 'minimal'
  if (budget === EFFORT_LOW) return 'low'
  if (budget === EFFORT_MEDIUM) return 'medium'
  if (budget === EFFORT_HIGH) return 'high'
  // 处理 raw budget 值 (向后兼容)
  if (budget < 4096) return 'low' // 1-4095: minimal + low -> low
  if (budget < 16384) return 'medium' // 4096-16383 -> medium
  return 'high' // 16384+ -> high
}

// ========== Grok Detection ==========

/**
 * 检测是否是 Grok 模型 (xAI)
 */
export function isGrokModel(cfg: ProviderConfigV2, modelId: string): boolean {
  const apiModel = apiModelId(cfg, modelId).toLowerCase()
  const logicalModel = modelId.toLowerCase()
  const grokPatterns = ['grok', 'xai-']
  for (const pattern of grokPatterns) {
    if (apiModel.includes(pattern) || logicalModel.includes(pattern)) {
      return true
    }
  }
  return false
}

/**
 * 检测是否是 xAI 端点
 */
export function isXAIEndpoint(cfg: ProviderConfigV2): boolean {
  try {
    const host = new URL(cfg.baseUrl).host.toLowerCase()
    return /(?:^|\.)x\.ai$/.test(host)
  } catch {
    return false
  }
}

// ========== MIME Type Helpers ==========

/**
 * 从文件路径获取 MIME 类型
 */
export function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

/**
 * 从 data URL 获取 MIME 类型
 */
export function mimeFromDataUrl(dataUrl: string): string {
  try {
    const start = dataUrl.indexOf(':')
    const semi = dataUrl.indexOf(';')
    if (start >= 0 && semi > start) {
      return dataUrl.substring(start + 1, semi)
    }
  } catch {
    // ignore
  }
  return 'image/png'
}

// ========== File Encoding ==========

/**
 * 将文件编码为 base64
 */
export async function encodeBase64File(filePath: string, withPrefix = false): Promise<string> {
  const bytes = await fs.promises.readFile(filePath)
  const b64 = bytes.toString('base64')
  if (withPrefix) {
    const mime = mimeFromPath(filePath)
    return `data:${mime};base64,${b64}`
  }
  return b64
}

// ========== URL Helpers ==========

/**
 * 从 URL 提取域名
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const uri = new URL(url)
    const host = uri.host
    return host.startsWith('www.') ? host.substring(4) : host
  } catch {
    return url
  }
}

/**
 * 提取并格式化 Grok 搜索引用
 */
export function extractGrokCitations(response: Record<string, unknown>): ToolResultInfo[] {
  try {
    const citations = response['citations']
    if (!Array.isArray(citations) || citations.length === 0) return []

    const items: Array<Record<string, unknown>> = []
    for (let i = 0; i < citations.length; i++) {
      const citation = citations[i]
      if (typeof citation === 'string') {
        items.push({
          index: i + 1,
          url: citation,
          title: extractDomainFromUrl(citation)
        })
      } else if (citation && typeof citation === 'object') {
        const c = citation as Record<string, unknown>
        const url = String(c['url'] ?? c['link'] ?? '')
        if (!url) continue
        items.push({
          index: i + 1,
          url,
          title: c['title'] ? String(c['title']) : extractDomainFromUrl(url),
          ...(c['snippet'] ? { snippet: String(c['snippet']) } : {})
        })
      }
    }
    if (items.length === 0) return []
    return [
      {
        id: 'builtin_search',
        name: 'search_web',
        arguments: {},
        content: JSON.stringify({ items })
      }
    ]
  } catch {
    return []
  }
}

// ========== Timestamp ==========

/**
 * 生成 UTC+8 时间戳字符串
 */
export function timestamp(): string {
  const now = new Date()
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = utc8.getUTCFullYear().toString().padStart(4, '0')
  const month = (utc8.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = utc8.getUTCDate().toString().padStart(2, '0')
  const hour = utc8.getUTCHours().toString().padStart(2, '0')
  const minute = utc8.getUTCMinutes().toString().padStart(2, '0')
  const second = utc8.getUTCSeconds().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

// ========== Schema Cleaning ==========

/**
 * 清理 JSON Schema 以适应 Google Gemini API 的严格验证
 */
export function cleanSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema }
  if (result['properties'] && typeof result['properties'] === 'object') {
    const props = { ...(result['properties'] as Record<string, unknown>) }
    for (const [key, value] of Object.entries(props)) {
      if (value && typeof value === 'object') {
        const propMap = { ...(value as Record<string, unknown>) }
        if (propMap['type'] === 'array' && !('items' in propMap)) {
          propMap['items'] = { type: 'string' }
        }
        if (propMap['type'] === 'object' && propMap['properties']) {
          propMap['properties'] = cleanSchemaForGemini({
            properties: propMap['properties']
          })['properties']
        }
        props[key] = propMap
      }
    }
    result['properties'] = props
  }
  if (result['items'] && typeof result['items'] === 'object') {
    result['items'] = cleanSchemaForGemini(result['items'] as Record<string, unknown>)
  }
  return result
}

/**
 * 清理 OpenAI 格式的 tools 以适应严格的后端
 */
export function cleanToolsForCompatibility(
  tools: Array<{ type: string; function: Record<string, unknown> }>
): Array<{ type: string; function: Record<string, unknown> }> {
  return tools.map((tool) => {
    const result = { ...tool }
    const fn = result.function
    if (fn && typeof fn === 'object') {
      const fnMap = { ...fn }
      const params = fnMap['parameters']
      if (params && typeof params === 'object') {
        fnMap['parameters'] = cleanSchemaForGemini(params as Record<string, unknown>)
      }
      result.function = fnMap
    }
    return result
  })
}

// ========== Vendor-Specific Reasoning Config ==========

/**
 * 应用厂商特定的 reasoning 参数到请求体
 */
export function applyVendorReasoningConfig(params: {
  body: Record<string, unknown>
  host: string
  modelId: string
  isReasoning: boolean
  thinkingBudget: number | undefined
  effort: string
  isGrokModel: boolean
}): void {
  const { body, host, modelId, isReasoning, thinkingBudget, effort, isGrokModel: isGrok } = params
  const off = isReasoningOff(thinkingBudget)

  if (host.includes('openrouter.ai')) {
    if (isReasoning) {
      if (off) {
        body['reasoning'] = { enabled: false }
      } else {
        const obj: Record<string, unknown> = { enabled: true }
        if (thinkingBudget !== undefined && thinkingBudget > 0) obj['max_tokens'] = thinkingBudget
        body['reasoning'] = obj
      }
      delete body['reasoning_effort']
    } else {
      delete body['reasoning']
      delete body['reasoning_effort']
    }
  } else if (host.includes('dashscope') || host.includes('aliyun')) {
    if (isReasoning) {
      body['enable_thinking'] = !off
      if (!off && thinkingBudget !== undefined && thinkingBudget > 0) {
        body['thinking_budget'] = thinkingBudget
      } else {
        delete body['thinking_budget']
      }
    } else {
      delete body['enable_thinking']
      delete body['thinking_budget']
    }
    delete body['reasoning_effort']
  } else if (host.includes('ark.cn-beijing.volces.com') || host.includes('volc') || host.includes('ark')) {
    if (isReasoning) {
      body['thinking'] = { type: off ? 'disabled' : 'enabled' }
    } else {
      delete body['thinking']
    }
    delete body['reasoning_effort']
  } else if (host.includes('intern-ai') || host.includes('intern') || host.includes('chat.intern-ai.org.cn')) {
    if (isReasoning) {
      body['thinking_mode'] = !off
    } else {
      delete body['thinking_mode']
    }
    delete body['reasoning_effort']
  } else if (host.includes('siliconflow')) {
    if (isReasoning) {
      if (off) {
        body['enable_thinking'] = false
      } else {
        delete body['enable_thinking']
      }
    } else {
      delete body['enable_thinking']
    }
    delete body['reasoning_effort']
  } else if (host.includes('deepseek') || modelId.toLowerCase().includes('deepseek')) {
    if (isReasoning) {
      if (off) {
        body['reasoning_content'] = false
        delete body['reasoning_budget']
      } else {
        body['reasoning_content'] = true
        if (thinkingBudget !== undefined && thinkingBudget > 0) {
          body['reasoning_budget'] = thinkingBudget
        } else {
          delete body['reasoning_budget']
        }
      }
    } else {
      delete body['reasoning_content']
      delete body['reasoning_budget']
    }
  } else if (modelId.toLowerCase().includes('mimo')) {
    // Xiaomi MiMo models
    if (isReasoning) {
      body['thinking'] = { type: off ? 'disabled' : 'enabled' }
    } else {
      delete body['thinking']
    }
    delete body['reasoning_effort']
  } else if (host.includes('opencode')) {
    delete body['reasoning_effort']
  } else if (isGrok) {
    const isGrok3Mini = modelId.toLowerCase().includes('grok-3-mini')
    if (!isGrok3Mini) {
      delete body['reasoning_effort']
    }
  }
}

// ========== Provider Kind Classification ==========

/**
 * 根据 provider ID 或配置分类 provider 类型
 */
export function classifyProviderKind(
  providerId: string,
  explicitType?: ProviderKind | string
): ProviderKind {
  if (explicitType === 'claude' || explicitType === 'google' || explicitType === 'openai') {
    return explicitType
  }
  const s = providerId.toLowerCase()
  if (s.includes('claude') || s.includes('anthropic')) return 'claude'
  if (s.includes('google') || s.includes('gemini')) return 'google'
  return 'openai'
}
