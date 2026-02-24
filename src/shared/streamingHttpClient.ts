/**
 * Streaming HTTP Client (shared)
 * 基于标准 fetch API 的 SSE 流式请求处理，零 Node.js 依赖
 */

import type { ProviderConfigV2 } from './types'

/** SSE 流式响应 */
export interface StreamResponse {
  statusCode: number
  headers: Headers
  lines: AsyncGenerator<string, void, unknown>
  rawStream: ReadableStream<Uint8Array> | null
}

/** postJsonStream 参数 */
export interface PostJsonStreamParams {
  url: string | URL
  headers: Record<string, string>
  body: Record<string, unknown>
  config?: ProviderConfigV2
  signal?: AbortSignal
}

type PostJsonStreamFn = (params: PostJsonStreamParams) => Promise<StreamResponse>

/**
 * 默认的 fetch 实现（不可被 setter 替换）
 * Main 进程的代理 fallback 必须调用此函数，避免递归
 */
export async function defaultPostJsonStream(params: PostJsonStreamParams): Promise<StreamResponse> {
  const { url, headers, body, signal } = params

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  })

  return {
    statusCode: response.status,
    headers: response.headers,
    lines: parseSSEStream(response.body),
    rawStream: response.body
  }
}

let _postJsonStreamImpl: PostJsonStreamFn = defaultPostJsonStream

/** 替换 postJsonStream 实现（Main 进程注入代理版本） */
export function setPostJsonStream(fn: PostJsonStreamFn): void {
  _postJsonStreamImpl = fn
}

/**
 * 发送流式 JSON 请求 (POST)
 * 返回 SSE 行迭代器。可通过 setPostJsonStream 替换实现。
 */
export async function postJsonStream(params: PostJsonStreamParams): Promise<StreamResponse> {
  return _postJsonStreamImpl(params)
}

/**
 * 解析 SSE 流为行迭代器
 */
export async function* parseSSEStream(
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
