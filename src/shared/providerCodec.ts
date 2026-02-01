/**
 * 供应商配置编解码器
 * 统一 Kelivo Flutter / Electron 的导入导出格式。
 *
 * 格式：kelivo-provider:<base64 JSON>
 * JSON 包含完整 ProviderConfigV2 的所有业务字段（排除 createdAt/updatedAt 等元数据）。
 * 支持多行（每行一个供应商）。
 */

import type { ProviderConfigV2, ApiKeyConfig, KeyManagementConfig } from './types'
import { createDefaultProviderConfig } from './types'

const PREFIX = 'kelivo-provider:'

// ─── 导出 ───────────────────────────────────────────────

function stripMeta(p: ProviderConfigV2): Record<string, unknown> {
  return {
    id: p.id,
    enabled: p.enabled,
    name: p.name,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    providerType: p.providerType,
    chatPath: p.chatPath,
    useResponseApi: p.useResponseApi,
    vertexAI: p.vertexAI,
    location: p.location,
    projectId: p.projectId,
    serviceAccountJson: p.serviceAccountJson,
    models: p.models,
    modelOverrides: p.modelOverrides,
    proxyEnabled: p.proxyEnabled,
    proxyHost: p.proxyHost,
    proxyPort: p.proxyPort,
    proxyUsername: p.proxyUsername,
    proxyPassword: p.proxyPassword,
    multiKeyEnabled: p.multiKeyEnabled,
    apiKeys: p.apiKeys,
    keyManagement: p.keyManagement,
    requestTimeout: p.requestTimeout,
    maxRetries: p.maxRetries,
    customHeaders: p.customHeaders,
    allowInsecureConnection: p.allowInsecureConnection,
    customAvatarPath: p.customAvatarPath
  }
}

export function encodeProvider(p: ProviderConfigV2): string {
  const json = JSON.stringify(stripMeta(p))
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return `${PREFIX}${b64}`
}

export function encodeProviders(ps: ProviderConfigV2[]): string {
  return ps.map(encodeProvider).join('\n')
}

// ─── 导入 ───────────────────────────────────────────────

export interface ImportedProvider {
  config: ProviderConfigV2
  sourceId: string
}

export interface ImportResult {
  providers: ImportedProvider[]
  errors: string[]
}

/** 解析输入文本，每行必须是 kelivo-provider:<base64> */
export function decodeProviders(input: string): ImportResult {
  const text = input.trim()
  if (!text) return { providers: [], errors: ['输入为空'] }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const providers: ImportedProvider[] = []
  const errors: string[] = []

  for (const line of lines) {
    try {
      if (line.startsWith(PREFIX)) {
        providers.push(decodeOne(line))
      } else {
        errors.push(`无法识别的格式（仅支持 kelivo-provider: 格式）: ${line.slice(0, 40)}...`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return { providers, errors }
}

function decodeOne(line: string): ImportedProvider {
  const b64 = line.substring(PREFIX.length)
  const json = decodeURIComponent(escape(atob(b64)))
  const obj = JSON.parse(json) as Record<string, unknown>

  const name = String(obj.name || '')
  const id = String(obj.id || name || 'imported')
  const base = createDefaultProviderConfig(id, name)

  const config: ProviderConfigV2 = {
    ...base,
    ...normalizeFields(obj),
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  return { config, sourceId: id }
}

/** 从 JSON 中安全提取所有字段 */
function normalizeFields(obj: Record<string, unknown>): Partial<ProviderConfigV2> {
  const result: Partial<ProviderConfigV2> = {}

  const str = (k: string): string | undefined => {
    const v = obj[k]
    return typeof v === 'string' ? v : undefined
  }
  const bool = (k: string): boolean | undefined => {
    const v = obj[k]
    return typeof v === 'boolean' ? v : undefined
  }
  const num = (k: string): number | undefined => {
    const v = obj[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }

  if (str('name')) result.name = str('name')!
  if (str('apiKey') !== undefined) result.apiKey = str('apiKey')!
  if (str('baseUrl')) result.baseUrl = str('baseUrl')!
  const pt = str('providerType')
  if (pt === 'openai' || pt === 'claude' || pt === 'google') result.providerType = pt
  if (str('chatPath') !== undefined) result.chatPath = str('chatPath')
  if (bool('useResponseApi') !== undefined) result.useResponseApi = bool('useResponseApi')
  if (bool('vertexAI') !== undefined) result.vertexAI = bool('vertexAI')
  if (str('location') !== undefined) result.location = str('location')
  if (str('projectId') !== undefined) result.projectId = str('projectId')
  if (str('serviceAccountJson') !== undefined) result.serviceAccountJson = str('serviceAccountJson')
  if (bool('enabled') !== undefined) result.enabled = bool('enabled')!

  if (Array.isArray(obj.models)) {
    result.models = (obj.models as unknown[]).filter(x => typeof x === 'string') as string[]
  }
  if (typeof obj.modelOverrides === 'object' && obj.modelOverrides !== null) {
    result.modelOverrides = obj.modelOverrides as Record<string, unknown>
  }

  if (bool('proxyEnabled') !== undefined) result.proxyEnabled = bool('proxyEnabled')
  if (str('proxyHost') !== undefined) result.proxyHost = str('proxyHost')
  if (str('proxyPort') !== undefined) result.proxyPort = str('proxyPort')
  if (str('proxyUsername') !== undefined) result.proxyUsername = str('proxyUsername')
  if (str('proxyPassword') !== undefined) result.proxyPassword = str('proxyPassword')

  if (bool('multiKeyEnabled') !== undefined) result.multiKeyEnabled = bool('multiKeyEnabled')
  if (Array.isArray(obj.apiKeys)) result.apiKeys = obj.apiKeys as ApiKeyConfig[]
  if (typeof obj.keyManagement === 'object' && obj.keyManagement !== null) {
    result.keyManagement = obj.keyManagement as KeyManagementConfig
  }

  if (num('requestTimeout') !== undefined) result.requestTimeout = num('requestTimeout')
  if (num('maxRetries') !== undefined) result.maxRetries = num('maxRetries')
  if (typeof obj.customHeaders === 'object' && obj.customHeaders !== null) {
    result.customHeaders = obj.customHeaders as Record<string, string>
  }
  if (bool('allowInsecureConnection') !== undefined) result.allowInsecureConnection = bool('allowInsecureConnection')
  if (str('customAvatarPath') !== undefined) result.customAvatarPath = str('customAvatarPath')

  return result
}
