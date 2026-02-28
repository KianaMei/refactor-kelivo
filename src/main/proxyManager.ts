/**
 * Proxy Manager
 * 管理全局代理配置，同时为 Electron session 和 Main 进程 HTTP 客户端提供代理支持
 */

import type { Session } from 'electron'
import type { AppConfig } from '../shared/types'

export interface GlobalProxyConfig {
  enabled: boolean
  type: 'http' | 'https' | 'socks5'
  host: string
  port: string
  username: string
  password: string
  bypass: string
}

const DEFAULT_BYPASS = 'localhost,127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1'

let _globalProxy: GlobalProxyConfig = {
  enabled: false,
  type: 'http',
  host: '',
  port: '8080',
  username: '',
  password: '',
  bypass: DEFAULT_BYPASS
}

export function getGlobalProxyConfig(): GlobalProxyConfig {
  return _globalProxy
}

function extractGlobalProxy(config: AppConfig): GlobalProxyConfig {
  return {
    enabled: config.proxyEnabled === true,
    type: config.proxyType ?? 'http',
    host: (config.proxyHost ?? '').trim(),
    port: (config.proxyPort ?? '8080').trim(),
    username: (config.proxyUsername ?? '').trim(),
    password: config.proxyPassword ?? '',
    bypass: config.proxyBypass ?? DEFAULT_BYPASS
  }
}

/**
 * 应用全局代理配置到 Electron session 和模块缓存
 */
export async function applyProxyConfig(ses: Session, config: AppConfig): Promise<void> {
  const gp = extractGlobalProxy(config)
  _globalProxy = gp

  if (!gp.enabled || !gp.host || !gp.port) {
    await ses.setProxy({ mode: 'direct' })
    return
  }

  const bypassList = gp.bypass
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',')

  if (gp.type === 'socks5') {
    const auth = gp.username ? `${encodeURIComponent(gp.username)}:${encodeURIComponent(gp.password)}@` : ''
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `socks5://${auth}${gp.host}:${gp.port}`,
      proxyBypassRules: bypassList || undefined
    })
  } else {
    const auth = gp.username ? `${encodeURIComponent(gp.username)}:${encodeURIComponent(gp.password)}@` : ''
    const scheme = gp.type === 'https' ? 'https' : 'http'
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `${scheme}://${auth}${gp.host}:${gp.port}`,
      proxyBypassRules: bypassList || undefined
    })
  }
}

/**
 * 检查目标 host 是否匹配 bypass 规则（逗号分隔）
 */
export function shouldBypassProxy(targetHost: string, bypassRules: string): boolean {
  if (!bypassRules.trim()) return false
  const host = targetHost.toLowerCase()
  const rules = bypassRules.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  for (const rule of rules) {
    if (rule === host) return true
    if (rule.startsWith('.') && host.endsWith(rule)) return true
    if (rule.startsWith('*') && host.endsWith(rule.slice(1))) return true
    // CIDR 匹配暂不实现（Electron session 自行处理），此处只做简单域名/IP匹配
  }
  return false
}

/**
 * 通过代理测试目标 URL 连通性
 */
export async function testProxyConnection(
  proxyConfig: GlobalProxyConfig,
  testUrl: string
): Promise<{ ok: boolean; message: string; statusCode?: number; elapsed?: number }> {
  const start = Date.now()
  try {
    const proxyUrl = buildProxyUrl(proxyConfig.type, proxyConfig.host, proxyConfig.port, proxyConfig.username, proxyConfig.password)
    if (!proxyUrl) {
      return { ok: false, message: '代理配置不完整' }
    }

    const agent = createProxyAgent(proxyConfig.type, proxyUrl)
    if (!agent) {
      return { ok: false, message: `不支持的代理类型或代理模块未安装: ${proxyConfig.type}` }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: controller.signal,
        agent
      } as RequestInit & { agent?: unknown })

      clearTimeout(timeout)
      const elapsed = Date.now() - start

      if (response.status >= 200 && response.status < 400) {
        return { ok: true, message: `连接成功 (${elapsed}ms)`, statusCode: response.status, elapsed }
      }
      return { ok: false, message: `HTTP ${response.status}`, statusCode: response.status, elapsed }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    const elapsed = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort') || msg.includes('Abort')) {
      return { ok: false, message: `连接超时 (${elapsed}ms)`, elapsed }
    }
    return { ok: false, message: msg, elapsed }
  }
}

// --- Internal helpers ---

export function buildProxyUrl(
  type: string,
  host: string,
  port: string,
  username: string,
  password: string
): string | null {
  if (!host || !port) return null
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  if (type === 'socks5') return `socks://${auth}${host}:${port}`
  if (type === 'https') return `https://${auth}${host}:${port}`
  return `http://${auth}${host}:${port}`
}

// 延迟加载代理 agent 模块
let _HttpsProxyAgent: (new (url: string) => unknown) | null = null
let _SocksProxyAgent: (new (url: string) => unknown) | null = null
let _agentsLoaded = false

function loadAgentModules(): void {
  if (_agentsLoaded) return
  _agentsLoaded = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
  } catch { /* not available */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
  } catch { /* not available */ }
}

export function createProxyAgent(type: string, proxyUrl: string): unknown | null {
  loadAgentModules()
  if (type === 'socks5') {
    return _SocksProxyAgent ? new _SocksProxyAgent(proxyUrl) : null
  }
  return _HttpsProxyAgent ? new _HttpsProxyAgent(proxyUrl) : null
}
