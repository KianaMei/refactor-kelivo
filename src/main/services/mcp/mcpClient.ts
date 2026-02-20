import type { McpTransportType } from '../../../shared/types'

type JsonRpcId = string | number

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown
}

type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: any
  error?: JsonRpcError
}

type McpTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type McpListToolsResult = {
  tools: McpTool[]
}

export type McpCallToolResult = {
  content: string
  isError?: boolean
}

type RequestHeaders = Record<string, string>

function headerGet(headers: Headers, name: string): string | null {
  // Node/Fetch headers are case-insensitive, but get() expects exact key; normalize here for safety.
  const direct = headers.get(name)
  if (direct) return direct
  const lower = name.toLowerCase()
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === lower) return v
  }
  return null
}

function truncateText(s: string, max = 3000): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

function stringifyJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

async function readTextSafe(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}

async function* iterateLines(stream: ReadableStream<Uint8Array> | null): AsyncGenerator<string, void, unknown> {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        yield line.endsWith('\r') ? line.slice(0, -1) : line
      }
    }
    if (buffer.length) {
      yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    }
  } finally {
    reader.releaseLock()
  }
}

type SseEvent = { event: string | null; data: string }

async function* parseSseEvents(stream: ReadableStream<Uint8Array> | null): AsyncGenerator<SseEvent, void, unknown> {
  let eventName: string | null = null
  const dataLines: string[] = []

  function flush(): SseEvent | null {
    if (dataLines.length === 0) return null
    const evt: SseEvent = { event: eventName, data: dataLines.join('\n') }
    eventName = null
    dataLines.length = 0
    return evt
  }

  for await (const line of iterateLines(stream)) {
    if (line === '') {
      const evt = flush()
      if (evt) yield evt
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || null
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s*/, ''))
      continue
    }
    // ignore: id:, retry:, comments, etc.
  }

  const last = flush()
  if (last) yield last
}

function resolveMaybeRelativeUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return maybeRelative
  }
}

function buildInitializeRequest(id: JsonRpcId): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      // 这里选一个相对新的协议版本；服务端可在响应中协商回退。
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'Kelivo (Electron)',
        version: '0.1.0'
      }
    }
  }
}

function buildInitializedNotification(): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  }
}

function buildToolsListRequest(id: JsonRpcId, cursor?: string | null): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/list',
    params: cursor ? { cursor } : {}
  }
}

function buildToolsCallRequest(id: JsonRpcId, name: string, args?: Record<string, unknown>): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args ?? {}
    }
  }
}

function assertJsonRpcResponse(json: any, expectedId: JsonRpcId): JsonRpcResponse {
  if (!json || typeof json !== 'object') {
    throw new Error(`MCP 响应不是 JSON 对象：${stringifyJson(json)}`)
  }
  if (json.jsonrpc !== '2.0') {
    throw new Error(`MCP 响应缺少 jsonrpc=2.0：${stringifyJson(json)}`)
  }
  if (json.id !== expectedId) {
    throw new Error(`MCP 响应 id 不匹配：expected=${String(expectedId)} actual=${String(json.id)}`)
  }
  return json as JsonRpcResponse
}

async function parseJsonRpcResponseFromSse(stream: ReadableStream<Uint8Array> | null, expectedId: JsonRpcId): Promise<JsonRpcResponse> {
  for await (const evt of parseSseEvents(stream)) {
    const text = (evt.data ?? '').trim()
    if (!text) continue
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      continue
    }
    if (!json || typeof json !== 'object') continue
    if (json.id !== expectedId) continue
    return assertJsonRpcResponse(json, expectedId)
  }
  throw new Error(`MCP SSE 响应流结束但未收到 id=${String(expectedId)} 的响应`)
}

function stringifyMcpContentBlock(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const x = v as Record<string, unknown>
    if (typeof x.text === 'string') return x.text
    if (typeof x.content === 'string') return x.content
  }
  return stringifyJson(v)
}

function parseMcpToolCallResult(result: unknown): McpCallToolResult {
  if (typeof result === 'string') {
    return { content: result }
  }

  if (!result || typeof result !== 'object') {
    return { content: stringifyJson(result) }
  }

  const obj = result as Record<string, unknown>
  const isError = typeof obj.isError === 'boolean' ? obj.isError : undefined
  const contentRaw = obj.content

  if (typeof contentRaw === 'string') {
    return { content: contentRaw, isError }
  }

  if (Array.isArray(contentRaw)) {
    const text = contentRaw
      .map((item) => stringifyMcpContentBlock(item))
      .filter((s) => s.trim().length > 0)
      .join('\n')
    if (text.trim().length > 0) {
      return { content: text, isError }
    }
  }

  if (obj.structuredContent !== undefined) {
    return { content: stringifyJson(obj.structuredContent), isError }
  }

  return { content: stringifyJson(obj), isError }
}

async function postStreamableHttp(params: {
  url: string
  customHeaders: RequestHeaders
  protocolVersion?: string | null
  sessionId?: string | null
  body: JsonRpcRequest
}): Promise<{ response: Response; sessionId: string | null; protocolVersion: string | null }> {
  const { url, customHeaders, protocolVersion, sessionId, body } = params

  const headers: Record<string, string> = {
    ...customHeaders,
    'Content-Type': 'application/json',
    // 按规范同时声明 json + sse；多数 listTools 会直接返回 json
    'Accept': 'application/json, text/event-stream'
  }
  if (sessionId) headers['MCP-Session-Id'] = sessionId
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  } as RequestInit)

  const nextSessionId = headerGet(response.headers, 'MCP-Session-Id')
  const nextProtocol = headerGet(response.headers, 'MCP-Protocol-Version')

  return {
    response,
    sessionId: nextSessionId ?? sessionId ?? null,
    protocolVersion: nextProtocol ?? protocolVersion ?? null
  }
}

async function streamableHttpRequestJsonRpc(params: {
  url: string
  customHeaders: RequestHeaders
  protocolVersion?: string | null
  sessionId?: string | null
  request: JsonRpcRequest
  expectedId?: JsonRpcId
}): Promise<{ json?: JsonRpcResponse; sessionId: string | null; protocolVersion: string | null }> {
  const { url, customHeaders, protocolVersion, sessionId, request, expectedId } = params
  const res = await postStreamableHttp({ url, customHeaders, protocolVersion, sessionId, body: request })

  // 通知：服务端通常返回 202，无响应体
  if (!expectedId) {
    if (!res.response.ok) {
      const bodyText = truncateText(await readTextSafe(res.response))
      throw new Error(`MCP 通知失败：HTTP ${res.response.status} ${res.response.statusText}\n${bodyText}`)
    }
    return { sessionId: res.sessionId, protocolVersion: res.protocolVersion }
  }

  if (!res.response.ok) {
    const bodyText = truncateText(await readTextSafe(res.response))
    throw new Error(`MCP 请求失败：HTTP ${res.response.status} ${res.response.statusText}\n${bodyText}`)
  }

  const ct = (headerGet(res.response.headers, 'Content-Type') ?? '').toLowerCase()
  if (ct.includes('application/json')) {
    const raw = await res.response.json()
    const json = assertJsonRpcResponse(raw, expectedId)
    return { json, sessionId: res.sessionId, protocolVersion: res.protocolVersion }
  }
  if (ct.includes('text/event-stream')) {
    const json = await parseJsonRpcResponseFromSse(res.response.body, expectedId)
    return { json, sessionId: res.sessionId, protocolVersion: res.protocolVersion }
  }

  const fallbackText = truncateText(await readTextSafe(res.response))
  throw new Error(`MCP 未知响应类型：content-type=${ct}\n${fallbackText}`)
}

async function listToolsViaStreamableHttp(url: string, headers: RequestHeaders): Promise<McpListToolsResult> {
  let sessionId: string | null = null
  let protocolVersion: string | null = null

  // 1) initialize
  const initId: JsonRpcId = 1
  const initResp = await streamableHttpRequestJsonRpc({
    url,
    customHeaders: headers,
    protocolVersion,
    sessionId,
    request: buildInitializeRequest(initId),
    expectedId: initId
  })
  sessionId = initResp.sessionId
  protocolVersion = initResp.protocolVersion ?? initResp.json?.result?.protocolVersion ?? protocolVersion

  if (!initResp.json?.result) {
    throw new Error('MCP initialize 没有返回 result')
  }

  // 2) notifications/initialized
  await streamableHttpRequestJsonRpc({
    url,
    customHeaders: headers,
    protocolVersion,
    sessionId,
    request: buildInitializedNotification()
  })

  // 3) tools/list (可能分页)
  const tools: McpTool[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page++) {
    const listId: JsonRpcId = 100 + page
    const resp = await streamableHttpRequestJsonRpc({
      url,
      customHeaders: headers,
      protocolVersion,
      sessionId,
      request: buildToolsListRequest(listId, cursor),
      expectedId: listId
    })

    const result = resp.json?.result
    const pageTools = Array.isArray(result?.tools) ? (result.tools as any[]) : []
    for (const t of pageTools) {
      if (!t || typeof t !== 'object') continue
      const name = typeof (t as any).name === 'string' ? (t as any).name : ''
      if (!name) continue
      const description = typeof (t as any).description === 'string' ? (t as any).description : undefined
      const inputSchema = (t as any).inputSchema && typeof (t as any).inputSchema === 'object'
        ? ((t as any).inputSchema as Record<string, unknown>)
        : undefined
      tools.push({ name, description, inputSchema })
    }

    cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null
    if (!cursor) break
  }

  // 4) best-effort: close session
  if (sessionId) {
    try {
      await fetch(url, {
        method: 'DELETE',
        headers: {
          ...headers,
          'MCP-Session-Id': sessionId,
          ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {})
        }
      } as RequestInit)
    } catch {
      // ignore
    }
  }

  return { tools }
}

async function callToolViaStreamableHttp(
  url: string,
  headers: RequestHeaders,
  toolName: string,
  args?: Record<string, unknown>
): Promise<McpCallToolResult> {
  let sessionId: string | null = null
  let protocolVersion: string | null = null
  try {
    const initId: JsonRpcId = 1
    const initResp = await streamableHttpRequestJsonRpc({
      url,
      customHeaders: headers,
      protocolVersion,
      sessionId,
      request: buildInitializeRequest(initId),
      expectedId: initId
    })
    sessionId = initResp.sessionId
    protocolVersion = initResp.protocolVersion ?? initResp.json?.result?.protocolVersion ?? protocolVersion

    if (!initResp.json?.result) {
      throw new Error('MCP initialize did not return result')
    }

    await streamableHttpRequestJsonRpc({
      url,
      customHeaders: headers,
      protocolVersion,
      sessionId,
      request: buildInitializedNotification()
    })

    const callId: JsonRpcId = 200
    const callResp = await streamableHttpRequestJsonRpc({
      url,
      customHeaders: headers,
      protocolVersion,
      sessionId,
      request: buildToolsCallRequest(callId, toolName, args),
      expectedId: callId
    })

    if (!callResp.json) {
      throw new Error('MCP tools/call did not return response')
    }
    if (callResp.json.error) {
      throw new Error(callResp.json.error.message || 'MCP tools/call error')
    }

    return parseMcpToolCallResult(callResp.json.result)
  } finally {
    if (sessionId) {
      try {
        await fetch(url, {
          method: 'DELETE',
          headers: {
            ...headers,
            'MCP-Session-Id': sessionId,
            ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {})
          }
        } as RequestInit)
      } catch {
        // ignore
      }
    }
  }
}

async function listToolsViaLegacySse(url: string, headers: RequestHeaders): Promise<McpListToolsResult> {
  const controller = new AbortController()

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      ...headers,
      'Accept': 'text/event-stream'
    },
    signal: controller.signal
  } as RequestInit)

  if (!resp.ok) {
    const bodyText = truncateText(await readTextSafe(resp))
    throw new Error(`MCP SSE 连接失败：HTTP ${resp.status} ${resp.statusText}\n${bodyText}`)
  }

  let endpointUrl: string | null = null
  let endpointResolve: ((v: string) => void) | null = null
  let endpointReject: ((err: Error) => void) | null = null
  const endpointPromise = new Promise<string>((resolve, reject) => {
    endpointResolve = resolve
    endpointReject = reject
  })

  const pending = new Map<string, (json: JsonRpcResponse) => void>()

  const readerTask = (async () => {
    try {
      for await (const evt of parseSseEvents(resp.body)) {
        const data = (evt.data ?? '').trim()
        if (!data) continue

        if (!endpointUrl && evt.event === 'endpoint') {
          endpointUrl = resolveMaybeRelativeUrl(url, data)
          if (endpointResolve && endpointUrl) (endpointResolve as any)(endpointUrl)
          continue
        }

        let json: any
        try {
          json = JSON.parse(data)
        } catch {
          continue
        }
        if (!json || typeof json !== 'object' || json.jsonrpc !== '2.0') continue
        const id = json.id as JsonRpcId | undefined
        if (id === undefined || id === null) continue
        const key = String(id)
        const cb = pending.get(key)
        if (!cb) continue
        pending.delete(key)
        cb(json as JsonRpcResponse)
      }
    } catch (e) {
      if (!endpointUrl) {
        if (endpointReject) (endpointReject as any)(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      // stream ended
      if (!endpointUrl && endpointReject) (endpointReject as any)(new Error('MCP SSE 流结束，未收到 endpoint 事件'))
    }
  })()

  const endpoint = await endpointPromise

  async function sendRequestAndWait(expectedId: JsonRpcId, req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const key = String(expectedId)
    const p = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key)
        reject(new Error(`MCP SSE 等待响应超时：id=${key}`))
      }, 15_000)
      pending.set(key, (json) => {
        clearTimeout(timer)
        try {
          resolve(assertJsonRpcResponse(json, expectedId))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    })

    const post = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req)
    } as RequestInit)
    if (!post.ok) {
      const bodyText = truncateText(await readTextSafe(post))
      throw new Error(`MCP SSE POST 失败：HTTP ${post.status} ${post.statusText}\n${bodyText}`)
    }

    return await p
  }

  try {
    // 1) initialize
    const initId: JsonRpcId = 1
    const initResp = await sendRequestAndWait(initId, buildInitializeRequest(initId))
    if (initResp.error) {
      throw new Error(`MCP initialize 错误：${initResp.error.message}`)
    }

    // 2) notifications/initialized（通知无需等响应）
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildInitializedNotification())
    } as RequestInit)

    // 3) tools/list（可能分页）
    const tools: McpTool[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page++) {
      const listId: JsonRpcId = 100 + page
      const resp = await sendRequestAndWait(listId, buildToolsListRequest(listId, cursor))
      if (resp.error) {
        throw new Error(`MCP tools/list 错误：${resp.error.message}`)
      }
      const result = resp.result
      const pageTools = Array.isArray(result?.tools) ? (result.tools as any[]) : []
      for (const t of pageTools) {
        if (!t || typeof t !== 'object') continue
        const name = typeof (t as any).name === 'string' ? (t as any).name : ''
        if (!name) continue
        const description = typeof (t as any).description === 'string' ? (t as any).description : undefined
        const inputSchema = (t as any).inputSchema && typeof (t as any).inputSchema === 'object'
          ? ((t as any).inputSchema as Record<string, unknown>)
          : undefined
        tools.push({ name, description, inputSchema })
      }
      cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null
      if (!cursor) break
    }

    return { tools }
  } finally {
    // Close stream
    try {
      controller.abort()
    } catch {
      // ignore
    }
    // let reader task settle
    void readerTask.catch(() => { })
  }
}

async function callToolViaLegacySse(
  url: string,
  headers: RequestHeaders,
  toolName: string,
  args?: Record<string, unknown>
): Promise<McpCallToolResult> {
  const controller = new AbortController()

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      ...headers,
      'Accept': 'text/event-stream'
    },
    signal: controller.signal
  } as RequestInit)

  if (!resp.ok) {
    const bodyText = truncateText(await readTextSafe(resp))
    throw new Error(`MCP SSE connect failed: HTTP ${resp.status} ${resp.statusText}\n${bodyText}`)
  }

  let endpointUrl: string | null = null
  let endpointResolve: ((v: string) => void) | null = null
  let endpointReject: ((err: Error) => void) | null = null
  const endpointPromise = new Promise<string>((resolve, reject) => {
    endpointResolve = resolve
    endpointReject = reject
  })

  const pending = new Map<string, (json: JsonRpcResponse) => void>()

  const readerTask = (async () => {
    try {
      for await (const evt of parseSseEvents(resp.body)) {
        const data = (evt.data ?? '').trim()
        if (!data) continue

        if (!endpointUrl && evt.event === 'endpoint') {
          endpointUrl = resolveMaybeRelativeUrl(url, data)
          if (endpointResolve && endpointUrl) (endpointResolve as any)(endpointUrl)
          continue
        }

        let json: unknown
        try {
          json = JSON.parse(data)
        } catch {
          continue
        }
        if (!json || typeof json !== 'object' || (json as { jsonrpc?: string }).jsonrpc !== '2.0') continue
        const id = (json as { id?: JsonRpcId }).id
        if (id === undefined || id === null) continue
        const key = String(id)
        const cb = pending.get(key)
        if (!cb) continue
        pending.delete(key)
        cb(json as JsonRpcResponse)
      }
    } catch (e) {
      if (!endpointUrl) {
        if (endpointReject) (endpointReject as any)(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (!endpointUrl && endpointReject) {
        (endpointReject as any)(new Error('MCP SSE stream ended before endpoint event'))
      }
    }
  })()

  const endpoint = await endpointPromise

  async function sendRequestAndWait(expectedId: JsonRpcId, req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const key = String(expectedId)
    const p = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key)
        reject(new Error(`MCP SSE response timeout: id=${key}`))
      }, 15_000)
      pending.set(key, (json) => {
        clearTimeout(timer)
        try {
          resolve(assertJsonRpcResponse(json, expectedId))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    })

    const post = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req)
    } as RequestInit)
    if (!post.ok) {
      const bodyText = truncateText(await readTextSafe(post))
      throw new Error(`MCP SSE POST failed: HTTP ${post.status} ${post.statusText}\n${bodyText}`)
    }

    return await p
  }

  try {
    const initId: JsonRpcId = 1
    const initResp = await sendRequestAndWait(initId, buildInitializeRequest(initId))
    if (initResp.error) {
      throw new Error(initResp.error.message || 'MCP initialize error')
    }

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildInitializedNotification())
    } as RequestInit)

    const callId: JsonRpcId = 200
    const callResp = await sendRequestAndWait(callId, buildToolsCallRequest(callId, toolName, args))
    if (callResp.error) {
      throw new Error(callResp.error.message || 'MCP tools/call error')
    }

    return parseMcpToolCallResult(callResp.result)
  } finally {
    try {
      controller.abort()
    } catch {
      // ignore
    }
    void readerTask.catch(() => { })
  }
}

export async function listMcpTools(params: {
  transport: McpTransportType
  url: string
  headers?: RequestHeaders
}): Promise<McpListToolsResult> {
  const { transport, url, headers = {} } = params

  if (transport === 'inmemory') return { tools: [] }

  const cleanedUrl = (url ?? '').trim()
  if (!cleanedUrl) throw new Error('MCP URL 不能为空')

  // 对齐 Flutter：transport=HTTP 走 Streamable HTTP；transport=SSE 走 legacy SSE（但也尝试兼容性）
  if (transport === 'sse') {
    return await listToolsViaLegacySse(cleanedUrl, headers)
  }

  // transport === 'http'
  try {
    return await listToolsViaStreamableHttp(cleanedUrl, headers)
  } catch (e) {
    // 兼容：若服务端其实是 legacy SSE，可尝试 fallback
    const msg = e instanceof Error ? e.message : String(e)
    const shouldFallback = /HTTP (400|404|405)/.test(msg)
    if (shouldFallback) {
      return await listToolsViaLegacySse(cleanedUrl, headers)
    }
    throw e
  }
}

export async function callMcpTool(params: {
  transport: McpTransportType
  url: string
  toolName: string
  args?: Record<string, unknown>
  headers?: RequestHeaders
}): Promise<McpCallToolResult> {
  const { transport, url, toolName, args, headers = {} } = params

  if (transport === 'inmemory') {
    throw new Error('MCP inmemory transport does not support tools/call')
  }
  if (transport === 'stdio') {
    throw new Error('MCP stdio transport is not implemented')
  }

  const cleanedUrl = (url ?? '').trim()
  if (!cleanedUrl) throw new Error('MCP URL cannot be empty')

  const cleanedToolName = (toolName ?? '').trim()
  if (!cleanedToolName) throw new Error('MCP toolName cannot be empty')

  if (transport === 'sse') {
    return await callToolViaLegacySse(cleanedUrl, headers, cleanedToolName, args)
  }

  try {
    return await callToolViaStreamableHttp(cleanedUrl, headers, cleanedToolName, args)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const shouldFallback = /HTTP (400|404|405)/.test(msg)
    if (shouldFallback) {
      return await callToolViaLegacySse(cleanedUrl, headers, cleanedToolName, args)
    }
    throw e
  }
}
