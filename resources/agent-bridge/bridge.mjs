/**
 * Kelivo Agent Bridge (Protocol v1)
 *
 * 约束：
 * - stdout：只输出 JSON-RPC（每行一个 JSON）
 * - stderr：调试日志（禁止输出 apiKey/baseUrl 原文）
 *
 * 入口：
 * - Electron main 通过：spawn(process.execPath, [bridge.mjs], env.ELECTRON_RUN_AS_NODE=1)
 */

import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const BRIDGE_VERSION = '1.0.0'
const PROTOCOL_VERSION = 1

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {AbortController|null} */
let currentAbortController = null
/** @type {{ runId: string, sdkProvider: string, resumeId: string|null } | null} */
let currentRun = null

/** @type {Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>} */
const pendingPermissions = new Map()

let externalDepsDir = null

function stderrInfo(msg, extra) {
  const suffix = extra ? ` ${extra}` : ''
  // 只写 stderr，避免污染 stdout 协议流
  process.stderr.write(`[agent-bridge] ${msg}${suffix}\n`)
}

function safePreview(v, maxChars = 500) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    if (!s) return ''
    if (s.length <= maxChars) return s
    return `${s.slice(0, maxChars)}…(truncated)`
  } catch {
    return ''
  }
}

function sendJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function sendResponse(id, result) {
  sendJson({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message, data) {
  const err = { code, message }
  if (data !== undefined) err.data = data
  sendJson({ jsonrpc: '2.0', id, error: err })
}

function sendNotification(method, params) {
  sendJson({ jsonrpc: '2.0', method, params })
}

function sendEvent(params) {
  sendNotification('notifications/event', params)
}

function getBundledResolvePaths() {
  const paths = []
  const pushIfExists = (p) => {
    if (!p) return
    try {
      if (existsSync(p)) paths.push(p)
    } catch { }
  }

  pushIfExists(process.cwd())
  pushIfExists(__dirname)
  pushIfExists(join(__dirname, '..'))

  // Electron 下通常存在
  const rp = process.resourcesPath
  if (typeof rp === 'string' && rp.trim()) {
    pushIfExists(rp)
    pushIfExists(join(rp, 'app.asar'))
    pushIfExists(join(rp, 'app.asar.unpacked'))
  }

  // 去重
  return Array.from(new Set(paths))
}

function pickSource(externalBaseDir, resolvedPath) {
  if (!externalBaseDir) return 'bundled'
  try {
    const normBase = externalBaseDir.replace(/\\/g, '/')
    const normResolved = String(resolvedPath).replace(/\\/g, '/')
    return normResolved.startsWith(normBase.replace(/\/+$/, '') + '/') ? 'external' : 'bundled'
  } catch {
    return 'bundled'
  }
}

async function loadPackage(pkgName, externalBaseDir) {
  const bundledPaths = getBundledResolvePaths()

  const tryLoad = async (paths, source) => {
    const entryPath = require.resolve(pkgName, { paths })
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths })
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    const version = typeof pkgJson.version === 'string' ? pkgJson.version : 'unknown'
    const mod = await import(pathToFileURL(entryPath).href)
    return { mod, version, source }
  }

  // 优先 external，失败自动回退 bundled（保证“可升级”不影响内置可用性）
  if (externalBaseDir && existsSync(externalBaseDir)) {
    try {
      return await tryLoad([externalBaseDir], 'external')
    } catch (e) {
      stderrInfo(`${pkgName} external 加载失败，回退 bundled：${e?.message ?? String(e)}`)
    }
  }

  return await tryLoad(bundledPaths, 'bundled')
}

/** @type {{ claude: any, codex: any }} */
const sdkCache = { claude: null, codex: null }

async function ensureClaudeSdk() {
  if (process.env.MOCK === '1') {
    return { available: true, version: 'mock', source: 'mock', query: null }
  }

  if (sdkCache.claude) return sdkCache.claude

  const externalBase = externalDepsDir ? join(externalDepsDir, 'claude-sdk') : null
  const { mod, version, source } = await loadPackage('@anthropic-ai/claude-agent-sdk', externalBase)
  const query = mod.query ?? mod.default?.query
  if (typeof query !== 'function') {
    throw new Error('Claude SDK 加载成功，但未找到 query() 导出')
  }

  sdkCache.claude = { available: true, version, source, query }
  return sdkCache.claude
}

async function ensureCodexSdk() {
  if (process.env.MOCK === '1') {
    return { available: true, version: 'mock', source: 'mock', Codex: null }
  }

  if (sdkCache.codex) return sdkCache.codex

  const externalBase = externalDepsDir ? join(externalDepsDir, 'codex-sdk') : null
  const { mod, version, source } = await loadPackage('@openai/codex-sdk', externalBase)
  const Codex = mod.Codex ?? mod.default?.Codex ?? mod.default
  if (typeof Codex !== 'function') {
    throw new Error('Codex SDK 加载成功，但未找到 Codex 构造函数导出')
  }

  sdkCache.codex = { available: true, version, source, Codex }
  return sdkCache.codex
}

async function getProviderStatus(provider) {
  try {
    if (provider === 'claude') {
      const sdk = await ensureClaudeSdk()
      return { available: !!sdk.available, version: sdk.version, source: sdk.source }
    }
    if (provider === 'codex') {
      const sdk = await ensureCodexSdk()
      return { available: !!sdk.available, version: sdk.version, source: sdk.source }
    }
    return { available: false, version: null, source: 'bundled' }
  } catch (e) {
    stderrInfo(`${provider} 初始化失败：${e?.message ?? String(e)}`)
    return { available: false, version: null, source: 'bundled' }
  }
}

function clearPendingPermissions(reason) {
  for (const [requestId, pending] of pendingPermissions.entries()) {
    clearTimeout(pending.timeout)
    pendingPermissions.delete(requestId)
    try {
      pending.resolve({ behavior: 'deny', message: reason, interrupt: true })
    } catch { }
  }
}

function createCanUseTool(runId) {
  return async (toolName, input, options) => {
    if (options?.signal?.aborted) {
      return { behavior: 'deny', message: '已中止', interrupt: true }
    }

    const requestId = `perm_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const expiresAt = Date.now() + 300000

    sendEvent({
      runId,
      type: 'permission.request',
      requestId,
      toolName: String(toolName ?? ''),
      toolUseId: typeof options?.toolUseID === 'string' ? options.toolUseID : null,
      inputPreview: safePreview(input, 500),
      decisionReason: typeof options?.decisionReason === 'string' ? options.decisionReason : null,
      expiresAt
    })

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingPermissions.delete(requestId)
        resolve({ behavior: 'deny', message: '权限请求超时', interrupt: true })
      }, 300000)

      pendingPermissions.set(requestId, { resolve, reject, timeout })
    })
  }
}

function normalizeClaudePermissionMode(permissionMode, allowDangerouslySkipPermissions) {
  const s = typeof permissionMode === 'string' ? permissionMode : ''
  if (s === 'acceptEdits') return 'acceptEdits'
  if (s === 'dontAsk') return 'dontAsk'
  if (s === 'plan') return 'plan'
  if (s === 'delegate') return 'delegate'
  if (s === 'bypassPermissions') {
    // 额外保护：必须显式确认 allowDangerouslySkipPermissions 才允许 bypass
    return allowDangerouslySkipPermissions ? 'bypassPermissions' : 'default'
  }
  return 'default'
}

async function runClaude(params) {
  const {
    runId,
    prompt,
    cwd,
    apiKey,
    baseUrl,
    model,
    permissionMode,
    allowDangerouslySkipPermissions,
    resumeId
  } = params

  const sdk = await ensureClaudeSdk()
  const query = sdk.query

  // 通过 env 透传（不写日志、不落盘）
  if (typeof apiKey === 'string' && apiKey.trim()) process.env.ANTHROPIC_API_KEY = apiKey.trim()
  else delete process.env.ANTHROPIC_API_KEY
  if (typeof baseUrl === 'string' && baseUrl.trim()) process.env.ANTHROPIC_BASE_URL = baseUrl.trim()
  else delete process.env.ANTHROPIC_BASE_URL

  /** @type {Map<string, string>} */
  const assistantSeen = new Map()
  let sdkSessionId = null
  let usage = null
  let costUSD = null

  const options = {
    model: typeof model === 'string' && model.trim() ? model.trim() : 'claude-sonnet-4-20250514',
    cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd(),
    maxTurns: 100,
    abortController: currentAbortController,
    includePartialMessages: true,
    permissionMode: normalizeClaudePermissionMode(permissionMode, allowDangerouslySkipPermissions),
    ...(resumeId ? { resume: resumeId } : {}),
    canUseTool: createCanUseTool(runId)
  }

  const iter = query({ prompt: String(prompt ?? ''), options })

  for await (const message of iter) {
    const t = message?.type

    if (t === 'stream_event') {
      const ev = message.event
      if (ev?.type === 'content_block_delta') {
        const delta = ev.delta
        if (delta?.type === 'text_delta') {
          const uuid = typeof message.uuid === 'string' ? message.uuid : 'assistant'
          const text = String(delta.text ?? '')
          if (text) {
            assistantSeen.set(uuid, (assistantSeen.get(uuid) ?? '') + text)
            sendEvent({ runId, type: 'assistant.delta', messageId: uuid, textDelta: text })
          }
        } else if (delta?.type === 'thinking_delta') {
          const uuid = typeof message.uuid === 'string' ? message.uuid : 'thinking'
          const thinking = String(delta.thinking ?? '')
          if (thinking) sendEvent({ runId, type: 'thinking.delta', messageId: uuid, textDelta: thinking })
        }
      }
      continue
    }

    if (t === 'system' && message.subtype === 'init') {
      sdkSessionId = typeof message.session_id === 'string' ? message.session_id : null
      if (sdkSessionId) sendEvent({ runId, type: 'resume.id', resumeId: sdkSessionId })
      continue
    }

    if (t === 'assistant') {
      const uuid = typeof message.uuid === 'string' ? message.uuid : null
      const content = message.message?.content

      if (Array.isArray(content)) {
        const toolUseBlocks = content.filter((b) => b?.type === 'tool_use')
        for (const block of toolUseBlocks) {
          const toolUseId = typeof block.id === 'string' ? block.id : randomUUID()
          const toolName = typeof block.name === 'string' ? block.name : 'tool'
          const toolInput = block.input ?? {}
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: toolUseId,
            toolName,
            toolInput,
            toolInputPreview: safePreview(toolInput, 500)
          })
        }

        // 兜底：如果没有产生 delta，则把完整文本补发出来
        if (uuid) {
          const textBlocks = content.filter((b) => b?.type === 'text')
          const fullText = textBlocks.map((b) => String(b.text ?? '')).join('')
          if (fullText && !assistantSeen.has(uuid)) {
            assistantSeen.set(uuid, fullText)
            sendEvent({ runId, type: 'assistant.delta', messageId: uuid, textDelta: fullText })
          }
          sendEvent({ runId, type: 'assistant.done', messageId: uuid })
        }
      }
      continue
    }

    if (t === 'user') {
      // tool result
      if (message.tool_use_result !== undefined) {
        const toolUseId = typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null
        const resultText = typeof message.tool_use_result === 'string'
          ? message.tool_use_result
          : safePreview(message.tool_use_result, 20000)
        if (toolUseId) {
          sendEvent({
            runId,
            type: 'tool.done',
            toolCallId: toolUseId,
            toolResult: resultText
          })
        }
      }
      continue
    }

    if (t === 'result') {
      if (message.subtype === 'success') {
        usage = message.usage ?? null
        costUSD = message.total_cost_usd ?? null
      } else {
        const errors = Array.isArray(message.errors) ? message.errors.join(', ') : ''
        const msg = errors || `执行失败：${String(message.subtype ?? 'unknown')}`
        sendEvent({ runId, type: 'status', status: 'error', message: msg })
      }
      continue
    }

    if (t === 'tool_progress') {
      const toolUseId = typeof message.tool_use_id === 'string' ? message.tool_use_id : null
      if (toolUseId) {
        sendEvent({
          runId,
          type: 'tool.progress',
          toolCallId: toolUseId,
          toolName: typeof message.tool_name === 'string' ? message.tool_name : null,
          elapsedSeconds: typeof message.elapsed_time_seconds === 'number' ? message.elapsed_time_seconds : null
        })
      }
      continue
    }
  }

  return { resumeId: sdkSessionId, usage, costUSD }
}

async function runCodex(params) {
  const {
    runId,
    prompt,
    cwd,
    apiKey,
    baseUrl,
    sandboxMode,
    approvalPolicy,
    resumeId
  } = params

  const sdk = await ensureCodexSdk()
  const Codex = sdk.Codex

  // 避免把 key/baseUrl 打到日志；这里只做存在性标记
  stderrInfo('codex run', `hasApiKey=${!!(apiKey && String(apiKey).trim())} hasBaseUrl=${!!(baseUrl && String(baseUrl).trim())}`)

  // 兼容不同 SDK 版本：尽量使用构造参数，否则退回 env
  const ctorConfig = {}
  if (typeof apiKey === 'string' && apiKey.trim()) ctorConfig.apiKey = apiKey.trim()
  if (typeof baseUrl === 'string' && baseUrl.trim()) ctorConfig.baseUrl = baseUrl.trim()
  if (typeof cwd === 'string' && cwd.trim()) ctorConfig.cwd = cwd.trim()
  if (typeof sandboxMode === 'string' && sandboxMode.trim()) ctorConfig.sandboxMode = sandboxMode.trim()
  if (typeof approvalPolicy === 'string' && approvalPolicy.trim()) ctorConfig.approvalPolicy = approvalPolicy.trim()

  if (typeof apiKey === 'string' && apiKey.trim()) process.env.OPENAI_API_KEY = apiKey.trim()
  else delete process.env.OPENAI_API_KEY
  if (typeof baseUrl === 'string' && baseUrl.trim()) process.env.OPENAI_BASE_URL = baseUrl.trim()
  else delete process.env.OPENAI_BASE_URL

  const codex = new Codex(ctorConfig)
  const thread = resumeId ? codex.resumeThread(String(resumeId)) : codex.startThread()

  /** @type {Map<string, string>} */
  const assistantTextById = new Map()
  /** @type {Map<string, any>} */
  const toolById = new Map()

  let threadId = null
  let usage = null

  const runInput = String(prompt ?? '')

  // 尝试 streamed API（不同版本可能签名不同，做降级）
  let events
  try {
    const r = await thread.runStreamed(runInput, {
      cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : undefined,
      sandboxMode,
      approvalPolicy,
      signal: currentAbortController?.signal
    })
    events = r?.events ?? r
  } catch (e) {
    // fallback：无 streamed 时直接 run()
    stderrInfo(`codex runStreamed 失败，尝试 run()：${e?.message ?? String(e)}`)
    const result = await thread.run(runInput)
    const text = typeof result === 'string' ? result : safePreview(result, 20000)
    const msgId = randomUUID()
    sendEvent({ runId, type: 'assistant.delta', messageId: msgId, textDelta: text })
    sendEvent({ runId, type: 'assistant.done', messageId: msgId })
    return { resumeId: threadId, usage, costUSD: null }
  }

  if (!events || typeof events[Symbol.asyncIterator] !== 'function') {
    const msgId = randomUUID()
    sendEvent({ runId, type: 'assistant.delta', messageId: msgId, textDelta: '(codex) 未获得事件流' })
    sendEvent({ runId, type: 'assistant.done', messageId: msgId })
    return { resumeId: threadId, usage, costUSD: null }
  }

  for await (const ev of events) {
    const type = ev?.type

    if (type === 'thread.started') {
      threadId = typeof ev.thread_id === 'string' ? ev.thread_id : null
      if (threadId) sendEvent({ runId, type: 'resume.id', resumeId: threadId })
      continue
    }

    if (type === 'turn.completed') {
      usage = ev.usage ?? usage
      continue
    }

    const item = ev?.item
    const itemId = typeof item?.id === 'string' ? item.id : null

    if ((type === 'item.started' || type === 'item.updated' || type === 'item.completed') && item && itemId) {
      // assistant message streaming
      if (item.type === 'agent_message' && typeof item.text === 'string') {
        const prev = assistantTextById.get(itemId) ?? ''
        const next = item.text
        const delta = next.startsWith(prev) ? next.slice(prev.length) : next
        if (delta) sendEvent({ runId, type: 'assistant.delta', messageId: itemId, textDelta: delta })
        assistantTextById.set(itemId, next)
        if (type === 'item.completed') sendEvent({ runId, type: 'assistant.done', messageId: itemId })
        continue
      }

      // tool mapping
      if (item.type === 'command_execution') {
        const command = typeof item.command === 'string' ? item.command : ''
        if (type === 'item.started') {
          toolById.set(itemId, { toolName: 'command_execution', command })
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: itemId,
            toolName: 'command_execution',
            toolInput: { command },
            toolInputPreview: safePreview({ command }, 500)
          })
        } else if (type === 'item.completed') {
          const output = typeof item.output === 'string'
            ? item.output
            : typeof item.result === 'string'
              ? item.result
              : safePreview(item.output ?? item.result ?? '', 20000)
          sendEvent({ runId, type: 'tool.done', toolCallId: itemId, toolResult: output })
        }
        continue
      }

      if (item.type === 'mcp_tool_call') {
        const server = typeof item.server === 'string' ? item.server : 'mcp'
        const tool = typeof item.tool === 'string' ? item.tool : 'tool'
        const toolName = `mcp__${server}__${tool}`
        if (type === 'item.started') {
          const args = item.arguments ?? {}
          sendEvent({
            runId,
            type: 'tool.start',
            toolCallId: itemId,
            toolName,
            toolInput: args,
            toolInputPreview: safePreview(args, 500)
          })
        } else if (type === 'item.completed') {
          const output = safePreview(item.output ?? item.result ?? '', 20000)
          sendEvent({ runId, type: 'tool.done', toolCallId: itemId, toolResult: output })
        }
        continue
      }
    }

    if (type === 'turn.failed' || type === 'error') {
      const msg = ev?.error?.message ?? ev?.message ?? 'Codex 执行失败'
      sendEvent({ runId, type: 'status', status: 'error', message: String(msg) })
      throw new Error(String(msg))
    }
  }

  return { resumeId: threadId, usage, costUSD: null }
}

async function runMock(params) {
  const runId = params.runId
  const resumeId = `mock_${Date.now()}`
  sendEvent({ runId, type: 'resume.id', resumeId })

  const assistantId = `mock_assistant_${Date.now()}`
  sendEvent({ runId, type: 'assistant.delta', messageId: assistantId, textDelta: '（MOCK）我将请求一次权限，然后执行一个工具。' })
  sendEvent({ runId, type: 'assistant.done', messageId: assistantId })

  const toolCallId = `mock_tool_${Date.now()}`
  sendEvent({ runId, type: 'tool.start', toolCallId, toolName: 'mock_tool', toolInput: { foo: 'bar' }, toolInputPreview: '{"foo":"bar"}' })

  const requestId = `mock_perm_${Date.now()}`
  sendEvent({
    runId,
    type: 'permission.request',
    requestId,
    toolName: 'mock_tool',
    toolUseId: toolCallId,
    inputPreview: '{"foo":"bar"}',
    decisionReason: 'mock',
    expiresAt: Date.now() + 300000
  })

  const decision = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ behavior: 'deny', message: 'mock 超时', interrupt: true }), 300000)
    pendingPermissions.set(requestId, {
      resolve: (r) => { clearTimeout(timeout); resolve(r) },
      reject: () => { clearTimeout(timeout); resolve({ behavior: 'deny', message: 'mock reject', interrupt: true }) },
      timeout
    })
  })

  if (decision?.behavior !== 'allow') {
    sendEvent({ runId, type: 'tool.error', toolCallId, toolName: 'mock_tool', message: '用户拒绝权限' })
    return { resumeId, usage: null, costUSD: null, success: false }
  }

  sendEvent({ runId, type: 'tool.done', toolCallId, toolResult: 'ok' })
  const assistantId2 = randomUUID()
  sendEvent({ runId, type: 'assistant.delta', messageId: assistantId2, textDelta: '（MOCK）工具执行完成。' })
  sendEvent({ runId, type: 'assistant.done', messageId: assistantId2 })
  return { resumeId, usage: { input_tokens: 1, output_tokens: 1 }, costUSD: 0, success: true }
}

async function handleInitialize(id, params) {
  const pv = params?.protocolVersion
  if (pv !== PROTOCOL_VERSION) {
    sendError(id, -32602, `protocolVersion 不匹配：期望 ${PROTOCOL_VERSION}，收到 ${String(pv)}`)
    return
  }

  externalDepsDir = typeof params?.externalDepsDir === 'string' && params.externalDepsDir.trim()
    ? params.externalDepsDir.trim()
    : null

  // externalDepsDir 变化时清缓存（让“一键升级”后可见）
  sdkCache.claude = null
  sdkCache.codex = null

  const claude = await getProviderStatus('claude')
  const codex = await getProviderStatus('codex')

  sendResponse(id, {
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    providers: { claude, codex }
  })
}

async function handleAgentRun(id, params) {
  const runId = typeof params?.runId === 'string' && params.runId.trim() ? params.runId.trim() : null
  const sdkProvider = typeof params?.sdkProvider === 'string' ? params.sdkProvider : null
  const prompt = typeof params?.prompt === 'string' ? params.prompt : ''

  if (!runId) {
    sendError(id, -32602, 'agent.run 缺少 runId')
    return
  }
  if (sdkProvider !== 'claude' && sdkProvider !== 'codex') {
    sendError(id, -32602, `agent.run 不支持 sdkProvider=${String(sdkProvider)}`)
    return
  }
  if (currentRun) {
    sendError(id, -32000, '当前已有 run 在执行中（首期仅支持单并发）', { currentRunId: currentRun.runId })
    return
  }

  currentAbortController = new AbortController()
  currentRun = { runId, sdkProvider, resumeId: null }

  sendEvent({ runId, type: 'status', status: 'running' })

  try {
    let r
    if (process.env.MOCK === '1') {
      r = await runMock({ ...params, runId })
    } else if (sdkProvider === 'claude') {
      r = await runClaude({ ...params, runId, prompt })
    } else {
      r = await runCodex({ ...params, runId, prompt })
    }

    const resumeId = r?.resumeId ?? null
    const usage = r?.usage ?? null
    const costUSD = r?.costUSD ?? null

    sendEvent({ runId, type: 'status', status: 'done' })
    sendResponse(id, { success: true, resumeId, usage, costUSD })
  } catch (e) {
    const aborted = e?.name === 'AbortError' || currentAbortController?.signal?.aborted
    const msg = e?.message ?? String(e)

    sendEvent({ runId, type: 'status', status: aborted ? 'aborted' : 'error', message: msg })
    sendResponse(id, { success: false, aborted, error: msg })
  } finally {
    clearPendingPermissions('run 已结束')
    currentAbortController = null
    currentRun = null
  }
}

function handleAgentAbort(params) {
  const runId = typeof params?.runId === 'string' ? params.runId : null
  if (!currentRun || !currentAbortController) return
  if (runId && currentRun.runId !== runId) return
  currentAbortController.abort()
  clearPendingPermissions('已中止')
}

function handlePermissionRespond(id, params) {
  const requestId = typeof params?.requestId === 'string' ? params.requestId : null
  if (!requestId) {
    sendError(id, -32602, 'permission.respond 缺少 requestId')
    return
  }

  const pending = pendingPermissions.get(requestId)
  if (!pending) {
    sendResponse(id, { ok: false, reason: 'not_found' })
    return
  }

  pendingPermissions.delete(requestId)
  clearTimeout(pending.timeout)

  const behavior = params?.behavior === 'allow' ? 'allow' : 'deny'
  const updatedInput = params?.updatedInput
  const message = typeof params?.message === 'string' ? params.message : undefined
  const interrupt = typeof params?.interrupt === 'boolean' ? params.interrupt : undefined

  pending.resolve({
    behavior,
    ...(updatedInput !== undefined ? { updatedInput } : {}),
    ...(message ? { message } : {}),
    ...(interrupt !== undefined ? { interrupt } : {})
  })

  sendResponse(id, { ok: true })
}

async function handleMessage(line) {
  const s = String(line ?? '').trim()
  if (!s) return

  let msg
  try {
    msg = JSON.parse(s)
  } catch {
    stderrInfo('收到无法解析的 JSON（已忽略）')
    return
  }

  if (msg?.jsonrpc !== '2.0') return

  const { id, method, params } = msg

  if (!method) return

  try {
    if (method === 'initialize') {
      await handleInitialize(id, params)
      return
    }
    if (method === 'agent.run') {
      void handleAgentRun(id, params)
      return
    }
    if (method === 'agent.abort') {
      handleAgentAbort(params)
      return
    }
    if (method === 'permission.respond') {
      handlePermissionRespond(id, params)
      return
    }

    if (id !== undefined && id !== null) {
      sendError(id, -32601, `Method not found: ${String(method)}`)
    }
  } catch (e) {
    if (id !== undefined && id !== null) {
      sendError(id, -32000, e?.message ?? String(e))
    } else {
      stderrInfo(`处理消息失败：${e?.message ?? String(e)}`)
    }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => { void handleMessage(line) })

process.on('SIGINT', () => {
  try { currentAbortController?.abort() } catch { }
  process.exit(0)
})

process.on('SIGTERM', () => {
  try { currentAbortController?.abort() } catch { }
  process.exit(0)
})

stderrInfo(`Kelivo Agent Bridge started (protocol=${PROTOCOL_VERSION}, mock=${process.env.MOCK === '1'})`)
