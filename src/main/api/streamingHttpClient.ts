/**
 * Streaming HTTP Client (main)
 * re-export shared 工具函数 + 保留带代理支持的 postJsonStream
 */

import type { ProviderConfigV2 } from '../../shared/types'

// re-export shared 层的纯函数和类型
export { parseSSELine, readErrorBody, isAbortError, joinUrl } from '../../shared/streamingHttpClient'
export type { StreamResponse } from '../../shared/streamingHttpClient'

import { postJsonStream as sharedPostJsonStream } from '../../shared/streamingHttpClient'

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
export async function postJsonStream(params: {
  url: string | URL
  headers: Record<string, string>
  body: Record<string, unknown>
  config?: ProviderConfigV2
  signal?: AbortSignal
}) {
  const { config } = params

  // 无代理配置时直接走 shared 版本
  if (!config?.proxyEnabled || !config.proxyHost || !config.proxyPort || !HttpsProxyAgent) {
    return sharedPostJsonStream(params)
  }

  // 有代理配置时使用 Node.js 的 https-proxy-agent
  const proxyUrl = buildProxyUrl(config)
  if (!proxyUrl) {
    return sharedPostJsonStream(params)
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
    lines: internalParseSSEStream(response.body),
    rawStream: response.body
  }
}

/** 内联 SSE 解析（与 shared 版本相同，因 parseSSEStream 未导出） */
async function* internalParseSSEStream(
  stream: ReadableStream<Uint8Array> | null
): AsyncGenerator<string, void, unknown> {
  if (!stream) return

  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        if (buffer.trim()) {
          yield buffer.trim()
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) {
          yield trimmed
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
