import type { KeyManagementConfig, ProviderKind, SettingsMenuKey, ThemeMode } from './definitions'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark'
}

// ========== Config Normalization Helpers ==========

export function cfgStr(v: unknown, d: string): string {
  return typeof v === 'string' ? v : d
}

export function cfgNum(v: unknown, d: number, min?: number, max?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d
  if (min !== undefined && v < min) return min
  if (max !== undefined && v > max) return max
  return v
}

export function cfgBool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d
}

export function cfgSafeId(v: unknown, prefix: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (s) return s
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function defaultKeyManagement(): KeyManagementConfig {
  return {
    strategy: 'roundRobin',
    maxFailuresBeforeDisable: 3,
    failureRecoveryTimeMinutes: 5,
    enableAutoRecovery: true
  }
}

export function classifyProviderKindByUrl(url: string): ProviderKind {
  const s = url.toLowerCase()
  if (s.includes('anthropic') || s.includes('claude')) return 'claude'
  if (s.includes('googleapis') || s.includes('generativelanguage') || s.includes('gemini')) return 'google'
  return 'openai'
}

export function inferProviderKindFromName(idOrName: string): ProviderKind {
  const s = idOrName.toLowerCase()
  if (s.includes('claude') || s.includes('anthropic')) return 'claude'
  if (s.includes('google') || s.includes('gemini')) return 'google'
  if (s.includes('response')) return 'openai_response'
  return 'openai'
}

export function isSettingsMenuKey(v: string): v is SettingsMenuKey {
  return (
    v === 'display' ||
    v === 'assistant' ||
    v === 'providers' ||
    v === 'defaultModel' ||
    v === 'search' ||
    v === 'mcp' ||
    v === 'quickPhrases' ||
    v === 'tts' ||
    v === 'networkProxy' ||
    v === 'backup' ||
    v === 'dependencies' ||
    v === 'data' ||
    v === 'about'
  )
}
