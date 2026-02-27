import type { SearchApiKeyConfig, SearchLoadBalanceStrategy } from '../../../shared/types'

// 运行时状态（随app重启重置）
const _rrCounters = new Map<string, number>()  // key: serviceId
const _luCounters = new Map<string, number>()  // key: SearchApiKeyConfig.id

function _getEnabled(keys: SearchApiKeyConfig[] | undefined): SearchApiKeyConfig[] | null {
  if (!keys || keys.length === 0) return null
  const enabled = keys.filter(k => k.isEnabled && k.key.trim() !== '')
  return enabled.length > 0 ? enabled : null
}

function _byPriority(keys: SearchApiKeyConfig[]): SearchApiKeyConfig {
  return [...keys].sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.sortIndex - b.sortIndex
  )[0]
}

function _byRoundRobin(serviceId: string, keys: SearchApiKeyConfig[]): SearchApiKeyConfig {
  const sorted = [...keys].sort((a, b) => a.sortIndex - b.sortIndex)
  const idx = _rrCounters.get(serviceId) ?? 0
  _rrCounters.set(serviceId, idx + 1)
  return sorted[idx % sorted.length]
}

function _byLeastUsed(keys: SearchApiKeyConfig[]): SearchApiKeyConfig {
  const selected = [...keys].sort((a, b) => {
    const diff = (_luCounters.get(a.id) ?? 0) - (_luCounters.get(b.id) ?? 0)
    return diff !== 0 ? diff : a.sortIndex - b.sortIndex
  })[0]
  _luCounters.set(selected.id, (_luCounters.get(selected.id) ?? 0) + 1)
  return selected
}

function _byRandom(keys: SearchApiKeyConfig[]): SearchApiKeyConfig {
  return keys[Math.floor(Math.random() * keys.length)]
}

export function selectSearchApiKey(
  serviceId: string,
  fallbackKey: string,
  apiKeys: SearchApiKeyConfig[] | undefined,
  strategy: SearchLoadBalanceStrategy | undefined
): string {
  const enabled = _getEnabled(apiKeys)
  if (!enabled) return fallbackKey
  switch (strategy ?? 'roundRobin') {
    case 'priority':  return _byPriority(enabled).key.trim()
    case 'leastUsed': return _byLeastUsed(enabled).key.trim()
    case 'random':    return _byRandom(enabled).key.trim()
    default:          return _byRoundRobin(serviceId, enabled).key.trim()
  }
}
