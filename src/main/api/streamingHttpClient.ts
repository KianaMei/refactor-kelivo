/**
 * Streaming HTTP Client
 * 基于 Node.js fetch API 的 SSE 流式请求处理
 */

import type { ProviderConfigV2 } from '../../shared/types'

/** SSE 流式响应 */
export interface StreamResponse {
  statusCode: number
  headers: Headers
  /** 可迭代的流，每次 yield 一行 SSE 数据 */
  lines: AsyncGenerator<string, void, unknown>
  /** 原始流 (用于错误处理) */
  rawStream: ReadableStream<Uint8Array> | null
}

// 可选的代理 agent 模块（延迟加载）
let HttpsProxyAgent: typeof import('https-proxy-agent').HttpsProxyAgent | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
} catch {
  // https-proxy-agent 未安装，代理功能将不可用
}

/**
 * 发送流式 JSON 请求 (POST)
 * 返回 SSE 行迭代器
 */
export async function postJsonStream(params: {
  url: string | URL
  headers: Record<string, string>
  body: Record<string, unknown>
  config?: ProviderConfigV2
  signal?: AbortSignal
}): Promise<StreamResponse> {
  const { url, headers, body, config, signal } = params

  // 构建 fetch 选项
  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  }

  // 配置代理 (如果启用且 https-proxy-agent 可用)
  if (config?.proxyEnabled && config.proxyHost && config.proxyPort && HttpsProxyAgent) {
    const proxyUrl = buildProxyUrl(config)
    if (proxyUrl) {
      fetchOptions.agent = new HttpsProxyAgent(proxyUrl)
    }
  }

  // 注意: SSL 验证跳过在 Node.js fetch 中需要通过环境变量 NODE_TLS_REJECT_UNAUTHORIZED=0 设置
  // 或者在 Electron 中使用 session.setCertificateVerifyProc

  const response = await fetch(url.toString(), fetchOptions as RequestInit)

  return {
    statusCode: response.status,
    headers: response.headers,
    lines: parseSSEStream(response.body),
    rawStream: response.body
  }
}

/**
 * 构建代理 URL
 */
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
 * 解析 SSE 流为行迭代器
 */
async function* parseSSEStream(
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
        // 处理剩余的 buffer
        if (buffer.trim()) {
          yield buffer.trim()
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // 按行分割
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // 最后一行可能不完整，保留在 buffer

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

/**
 * 解析单个 SSE 数据行
 * 返回 data 字段的内容，如果是 [DONE] 则返回 null
 */
export function parseSSELine(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null
  }

  const data = line.substring(5).trimStart()

  if (data === '[DONE]') {
    return null
  }

  return data
}

/**
 * 读取完整的错误响应体
 */
export async function readErrorBody(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ''

  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  const chunks: string[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
    }
    return chunks.join('')
  } catch {
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

/**
 * 检查是否是中止错误
 */
export function isAbortError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('abort') || msg.includes('aborted')) return true
  }
  return false
}

/**
 * 连接 URL 路径
 */
export function joinUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  const extra = path.replace(/^\/+/, '')
  base.pathname = `${basePath}/${extra}`
  return base.toString()
}
