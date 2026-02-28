/**
 * Streaming HTTP Client (main)
 * re-export shared 工具函数 + 保留带代理支持的 postJsonStream
 * 支持：Provider 级代理（优先） → 全局代理（兜底） → 直连
 */

import {
  defaultPostJsonStream,
  parseSSEStream,
  type PostJsonStreamParams,
  type StreamResponse
} from '../../shared/streamingHttpClient'
import {
  getGlobalProxyConfig,
  buildProxyUrl,
  createProxyAgent,
  shouldBypassProxy
} from '../proxyManager'

// re-export shared 层的纯函数和类型
export { parseSSELine, readErrorBody, isAbortError, joinUrl, parseSSEStream } from '../../shared/streamingHttpClient'
export type { StreamResponse } from '../../shared/streamingHttpClient'

/**
 * 解析请求目标 host（用于 bypass 检查）
 */
function extractHost(url: string | URL): string {
  try {
    return new URL(url.toString()).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Main 侧 postJsonStream
 * 优先级：Provider 代理 > 全局代理 > 直连
 */
export async function postJsonStream(params: PostJsonStreamParams): Promise<StreamResponse> {
  const { config, url } = params
  const targetHost = extractHost(url)

  // 1. Provider 级代理（优先）
  if (config?.proxyEnabled && config.proxyHost?.trim() && config.proxyPort?.trim()) {
    const proxyUrl = buildProxyUrl('http', config.proxyHost.trim(), config.proxyPort.trim(), config.proxyUsername?.trim() ?? '', config.proxyPassword?.trim() ?? '')
    if (proxyUrl) {
      const agent = createProxyAgent('http', proxyUrl)
      if (agent) {
        return fetchWithAgent(params, agent)
      }
    }
  }

  // 2. 全局代理（兜底）
  const gp = getGlobalProxyConfig()
  if (gp.enabled && gp.host && gp.port) {
    // 检查 bypass 规则
    if (targetHost && shouldBypassProxy(targetHost, gp.bypass)) {
      return defaultPostJsonStream(params)
    }

    const proxyUrl = buildProxyUrl(gp.type, gp.host, gp.port, gp.username, gp.password)
    if (proxyUrl) {
      const agent = createProxyAgent(gp.type, proxyUrl)
      if (agent) {
        return fetchWithAgent(params, agent)
      }
    }
  }

  // 3. 直连
  return defaultPostJsonStream(params)
}

async function fetchWithAgent(params: PostJsonStreamParams, agent: unknown): Promise<StreamResponse> {
  const { url, headers, body, signal } = params

  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal,
    agent
  }

  const response = await fetch(url.toString(), fetchOptions as RequestInit)

  return {
    statusCode: response.status,
    headers: response.headers,
    lines: parseSSEStream(response.body),
    rawStream: response.body
  }
}
