/**
 * Streaming HTTP Client (shared)
 * 基于标准 fetch API 的 SSE 流式请求处理，零 Node.js 依赖
 */

/** SSE 流式响应 */
export interface StreamResponse {
  statusCode: number
  headers: Headers
  lines: AsyncGenerator<string, void, unknown>
  rawStream: ReadableStream<Uint8Array> | null
}

/**
 * 发送流式 JSON 请求 (POST)
 * 返回 SSE 行迭代器
 */
export async function postJsonStream(params: {
  url: string | URL
  headers: Record<string, string>
  body: Record<string, unknown>
  signal?: AbortSignal
}): Promise<StreamResponse> {
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
