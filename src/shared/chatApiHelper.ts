/**
 * Chat API Helper (shared)
 * 纯逻辑函数，零 Node.js 依赖，可在 Main / Renderer 两侧使用
 */

import type { ProviderConfigV2, ProviderKind, ApiKeyConfig } from './types'
import type { ToolDefinition, ToolResultInfo } from './chatStream'

// 多key运行时状态（随app重启重置，绝不写回config）
const _roundRobinCounters = new Map<string, number>() // key: cfg.id
const _leastUsedCounters = new Map<string, number>()  // key: ApiKeyConfig.id

// ========== Reasoning Effort Level Constants ==========
export const EFFORT_AUTO = -1
export const EFFORT_OFF = 0
export const EFFORT_MINIMAL = -10
export const EFFORT_LOW = -20
export const EFFORT_MEDIUM = -30
export const EFFORT_HIGH = -40
export const EFFORT_XHIGH = -50

export const EFFORT_LEVELS = [EFFORT_AUTO, EFFORT_OFF, EFFORT_MINIMAL, EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_XHIGH]

// ========== Model ID Resolution ==========

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

function _getEnabledKeys(cfg: ProviderConfigV2): ApiKeyConfig[] | null {
  if (!cfg.multiKeyEnabled || !cfg.apiKeys || cfg.apiKeys.length === 0) return null
  const enabled = cfg.apiKeys.filter(k => k.isEnabled && k.key.trim() !== '')
  return enabled.length > 0 ? enabled : null
}

function _selectByPriority(keys: ApiKeyConfig[]): ApiKeyConfig {
  return [...keys].sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.sortIndex - b.sortIndex
  )[0]
}

function _selectByRoundRobin(providerId: string, keys: ApiKeyConfig[]): ApiKeyConfig {
  const sorted = [...keys].sort((a, b) => a.sortIndex - b.sortIndex)
  const idx = _roundRobinCounters.get(providerId) ?? 0
  _roundRobinCounters.set(providerId, idx + 1)
  return sorted[idx % sorted.length]
}

function _selectByLeastUsed(keys: ApiKeyConfig[]): ApiKeyConfig {
  const selected = [...keys].sort((a, b) => {
    const diff = (_leastUsedCounters.get(a.id) ?? 0) - (_leastUsedCounters.get(b.id) ?? 0)
    return diff !== 0 ? diff : a.sortIndex - b.sortIndex
  })[0]
  _leastUsedCounters.set(selected.id, (_leastUsedCounters.get(selected.id) ?? 0) + 1)
  return selected
}

function _selectByRandom(keys: ApiKeyConfig[]): ApiKeyConfig {
  return keys[Math.floor(Math.random() * keys.length)]
}

function _selectKey(cfg: ProviderConfigV2, keys: ApiKeyConfig[]): string {
  switch (cfg.keyManagement?.strategy ?? 'roundRobin') {
    case 'priority':  return _selectByPriority(keys).key.trim()
    case 'leastUsed': return _selectByLeastUsed(keys).key.trim()
    case 'random':    return _selectByRandom(keys).key.trim()
    default:          return _selectByRoundRobin(cfg.id, keys).key.trim()
  }
}

export function effectiveApiKey(cfg: ProviderConfigV2): string {
  // OAuth 优先
  if (cfg.oauthEnabled && cfg.oauthData?.accessToken) {
    return cfg.oauthData.accessToken
  }
  const keys = _getEnabledKeys(cfg)
  if (keys) return _selectKey(cfg, keys)
  // 多 Key 模式下不回退到单 key（避免”看起来开了多 key，实际还在用 apiKey”的特殊情况）
  if (cfg.multiKeyEnabled) return ''
  return cfg.apiKey
}

export function apiKeyForRequest(cfg: ProviderConfigV2, _modelId: string): string {
  return effectiveApiKey(cfg).trim()
}

// ========== Model Overrides ==========

export function modelOverride(cfg: ProviderConfigV2, modelId: string): Record<string, unknown> {
  const ov = cfg.modelOverrides[modelId]
  if (ov && typeof ov === 'object') return ov as Record<string, unknown>
  return {}
}

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

export function isReasoningOff(budget: number | undefined): boolean {
  return budget !== undefined && budget === 0
}

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
    case EFFORT_XHIGH:
      return 'xhigh'
    default:
      return 'auto'
  }
}

export function isEffortLevel(value: number | undefined): boolean {
  return value !== undefined && (value < 0 || value === 0)
}

export function getModelMaxThinkingBudget(modelId: string): number {
  const m = modelId.toLowerCase()
  if (m.includes('opus') || m.includes('sonnet')) return 64000
  if (m.includes('claude')) return 32000
  if (m.includes('gemini-2.5-pro') || m.includes('2.5-pro')) return 32768
  if (m.includes('gemini-2.5-flash') || m.includes('2.5-flash')) return 24576
  if (m.includes('gemini-3') || m.includes('gemini-3.0')) return 32768
  if (m.includes('deepseek')) return 32768
  if (m.includes('o1') || m.includes('o3') || m.includes('o4')) return 100000
  return 32768
}

export function effortToBudget(storedValue: number | undefined, modelId: string): number {
  if (storedValue === undefined || storedValue === EFFORT_AUTO) return -1
  if (storedValue === EFFORT_OFF) return 0
  if (storedValue > 0) return storedValue

  const max = getModelMaxThinkingBudget(modelId)
  switch (storedValue) {
    case EFFORT_MINIMAL:
      return Math.max(128, Math.min(max, Math.round(max * 0.03)))
    case EFFORT_LOW:
      return Math.max(128, Math.min(max, Math.round(max * 0.1)))
    case EFFORT_MEDIUM:
      return Math.round(max * 0.33)
    case EFFORT_HIGH:
      return max
    case EFFORT_XHIGH:
      return max
    default:
      return -1
  }
}

export function effortForBudget(budget: number | undefined): string {
  if (budget === undefined || budget === -1) return 'auto'
  if (budget === 0) return 'off'
  if (budget === EFFORT_MINIMAL) return 'minimal'
  if (budget === EFFORT_LOW) return 'low'
  if (budget === EFFORT_MEDIUM) return 'medium'
  if (budget === EFFORT_HIGH) return 'high'
  if (budget === EFFORT_XHIGH) return 'xhigh'
  if (budget < 4096) return 'low'
  if (budget < 16384) return 'medium'
  return 'high'
}

export function supportsResponsesXHighEffort(modelId: string): boolean {
  const m = (modelId || '').toLowerCase().trim()
  if (!m) return false
  if (m.startsWith('gpt-5.1-codex-max')) return true
  if (m.startsWith('gpt-5.2-codex')) return true
  if (m.startsWith('gpt-5.2')) return true
  if (m.startsWith('gpt-5.3-codex')) return true
  return false
}

// ========== Grok Detection ==========

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

export function isXAIEndpoint(cfg: ProviderConfigV2): boolean {
  try {
    const host = new URL(cfg.baseUrl).host.toLowerCase()
    return /(?:^|\.)x\.ai$/.test(host)
  } catch {
    return false
  }
}

// ========== MIME Type Helpers ==========

export function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

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

// ========== URL Helpers ==========

export function extractDomainFromUrl(url: string): string {
  try {
    const uri = new URL(url)
    const host = uri.host
    return host.startsWith('www.') ? host.substring(4) : host
  } catch {
    return url
  }
}

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

export function timestamp(): string {
  const now = new Date()
  const year = now.getFullYear().toString().padStart(4, '0')
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const hour = now.getHours().toString().padStart(2, '0')
  const minute = now.getMinutes().toString().padStart(2, '0')
  const second = now.getSeconds().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

// ========== Schema Cleaning ==========

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

export function cleanToolsForCompatibility(
  tools: ToolDefinition[]
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

export function classifyProviderKind(
  providerId: string,
  explicitType?: ProviderKind | string
): ProviderKind {
  if (explicitType === 'openai_response') {
    return 'openai'
  }
  // OAuth 类型映射到对应的基础 adapter
  if (explicitType === 'claude_oauth') return 'claude'
  if (explicitType === 'codex_oauth') return 'openai'
  if (explicitType === 'gemini_cli_oauth' || explicitType === 'antigravity_oauth') return 'google'
  if (explicitType === 'kimi_oauth' || explicitType === 'qwen_oauth') return 'openai'

  if (explicitType === 'claude' || explicitType === 'google' || explicitType === 'openai') {
    return explicitType
  }
  const s = providerId.toLowerCase()
  if (s.includes('claude') || s.includes('anthropic')) return 'claude'
  if (s.includes('google') || s.includes('gemini')) return 'google'
  return 'openai'
}
