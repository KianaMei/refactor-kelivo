/**
 * Streaming HTTP Client (main)
 * re-export shared 工具函数 + 保留带代理支持的 postJsonStream
 */

import type { ProviderConfigV2 } from '../../shared/types'
import {
  defaultPostJsonStream,
  parseSSEStream,
  type PostJsonStreamParams,
  type StreamResponse
} from '../../shared/streamingHttpClient'

// re-export shared 层的纯函数和类型
export { parseSSELine, readErrorBody, isAbortError, joinUrl, parseSSEStream } from '../../shared/streamingHttpClient'
export type { StreamResponse } from '../../shared/streamingHttpClient'

// 可选的代理 agent 模块（延迟加载）
let HttpsProxyAgent: typeof import('https-proxy-agent').HttpsProxyAgent | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
} catch {
  // https-proxy-agent 未安装，代理功能将不可用
}

function buildProxyUrl(config: ProviderConfigV2): string | null {
  if (!config.proxyEnabled || !config.proxyHost || !config.proxyPort) {
    return null
  }

  const host = config.proxyHost.trim()
  const port = config.proxyPort.trim()
  const user = config.proxyUsername?.trim() ?? ''
  const pass = config.proxyPassword?.trim() ?? ''

  if (!host || !port) return null

  if (user && pass) {
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`
  }
  return `http://${host}:${port}`
}

/**
 * Main 侧 postJsonStream — 在 shared 版本基础上增加代理支持
 */
export async function postJsonStream(params: PostJsonStreamParams): Promise<StreamResponse> {
  const { config } = params

  // 无代理配置时走不可替换的原始 fetch 实现（避免递归）
  if (!config?.proxyEnabled || !config.proxyHost || !config.proxyPort || !HttpsProxyAgent) {
    return defaultPostJsonStream(params)
  }

  // 有代理配置时使用 Node.js 的 https-proxy-agent
  const proxyUrl = buildProxyUrl(config)
  if (!proxyUrl) {
    return defaultPostJsonStream(params)
  }

  const { url, headers, body, signal } = params
  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal,
    agent: new HttpsProxyAgent(proxyUrl)
  }

  const response = await fetch(url.toString(), fetchOptions as RequestInit)

  return {
    statusCode: response.status,
    headers: response.headers,
    lines: parseSSEStream(response.body),
    rawStream: response.body
  }
}
