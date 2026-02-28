/**
 * Google (Gemini/Vertex AI) Provider Adapter (shared)
 * 处理 Google Gemini 和 Vertex AI 的流式聊天补全
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../../types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn,
  TokenUsage
} from '../../chatStream'
import { emptyUsage, mergeUsage } from '../../chatStream'
import { postJsonStream, readErrorBody } from '../../streamingHttpClient'
import type { SendStreamParams, UserImage } from '../adapterParams'
import {
  apiModelId,
  effectiveApiKey,
  customHeaders,
  customBody,
  parseOverrideValue,
  mimeFromPath,
  builtInTools,
  cleanSchemaForGemini,
  EFFORT_MINIMAL,
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  effortToBudget
} from '../../chatApiHelper'
import { resolveGeminiToolsPayload } from './googleGeminiTools'

// ========== Thinking Budget Constants ==========
const PRO_THINKING_MIN = 128
const PRO_THINKING_MAX = 32768
const FLASH_THINKING_MAX = 24576
const FLASH_LITE_THINKING_MIN = 512
const FLASH_LITE_THINKING_MAX = 24576

// ========== Gemini thought_signature 处理 ==========
const GEMINI_THOUGHT_SIG_TAG = 'gemini_thought_signatures'
const GEMINI_THOUGHT_SIG_COMMENT = /<!--\s*gemini_thought_signatures:(.*?)-->/gs

interface GeminiSignatureMeta {
  cleanedText: string
  textKey?: string
  textValue?: unknown
  images: Array<{ k: string; v: unknown }>
}

function extractGeminiThoughtMeta(raw: string): GeminiSignatureMeta {
  try {
    const matches = [...raw.matchAll(GEMINI_THOUGHT_SIG_COMMENT)]
    if (matches.length === 0) return { cleanedText: raw, images: [] }

    const m = matches[matches.length - 1]
    const payloadRaw = (m[1] || '').trim()
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(payloadRaw) } catch { /* empty */ }

    let textKey: string | undefined
    let textVal: unknown
    const text = data.text as Record<string, unknown> | undefined
    if (text && typeof text === 'object') {
      textKey = ((text.k ?? text.key) as string | undefined)?.toString()
      textVal = text.v ?? text.val
      if (textKey && textKey.trim() === '') textKey = undefined
    }

    const images: Array<{ k: string; v: unknown }> = []
    const imgList = data.images
    if (Array.isArray(imgList)) {
      for (const e of imgList) {
        if (!e || typeof e !== 'object') continue
        const k = ((e as Record<string, unknown>).k ?? (e as Record<string, unknown>).key)?.toString() ?? ''
        const v = (e as Record<string, unknown>).v ?? (e as Record<string, unknown>).val
        if (k && v !== undefined) images.push({ k, v })
      }
    }

    const cleaned = raw.replace(GEMINI_THOUGHT_SIG_COMMENT, '').trimEnd()
    return { cleanedText: cleaned, textKey, textValue: textVal, images }
  } catch {
    return { cleanedText: raw, images: [] }
  }
}

function buildGeminiThoughtSigComment(options: {
  textKey?: string
  textValue?: unknown
  imageSigs?: Array<{ k: string; v: unknown }>
}): string {
  const { textKey, textValue, imageSigs = [] } = options
  const imgs = imageSigs.filter(e => e.k && e.v !== undefined)
  const hasText = textKey && textValue !== undefined
  if (!hasText && imgs.length === 0) return ''

  const payload: Record<string, unknown> = {}
  if (hasText) payload.text = { k: textKey, v: textValue }
  if (imgs.length > 0) payload.images = imgs
  return `\n<!-- ${GEMINI_THOUGHT_SIG_TAG}:${JSON.stringify(payload)} -->`
}

function applyGeminiThoughtSignatures(
  meta: GeminiSignatureMeta,
  parts: Array<Record<string, unknown>>,
  attachDummyWhenMissing = false
): void {
  const hasText = meta.textKey && meta.textValue !== undefined
  const hasImages = meta.images.length > 0
  const hasAny = hasText || hasImages

  if (hasAny) {
    if (hasText) {
      for (const part of parts) {
        if ('text' in part) {
          part[meta.textKey!] = meta.textValue
          break
        }
      }
    }
    if (hasImages) {
      let idx = 0
      for (const part of parts) {
        if (idx >= meta.images.length) break
        if ('inline_data' in part || 'inlineData' in part) {
          const sig = meta.images[idx]
          if (sig.k && sig.v !== undefined) part[sig.k] = sig.v
          idx++
        }
      }
    }
  } else if (attachDummyWhenMissing) {
    const dummy = 'context_engineering_is_the_way_to_go'
    let inlineFound = false
    let textTagged = false
    for (const part of parts) {
      const hasText = 'text' in part
      const hasInline = 'inline_data' in part || 'inlineData' in part
      if (hasInline) {
        inlineFound = true
        if (!('thoughtSignature' in part)) part.thoughtSignature = dummy
      }
      if (hasText && hasInline && !textTagged) {
        if (!('thoughtSignature' in part)) part.thoughtSignature = dummy
        textTagged = true
      }
    }
    if (inlineFound && !textTagged) {
      for (const part of parts) {
        if ('text' in part) {
          if (!('thoughtSignature' in part)) part.thoughtSignature = dummy
          break
        }
      }
    }
  }
}

function collectThoughtSigCommentFromParts(parts: unknown[]): string {
  let textKey: string | undefined
  let textVal: unknown
  const images: Array<{ k: string; v: unknown }> = []

  for (const p of parts) {
    if (!p || typeof p !== 'object') continue
    const part = p as Record<string, unknown>

    let sigKey: string | undefined
    let sigVal: unknown
    if ('thoughtSignature' in part) {
      sigKey = 'thoughtSignature'
      sigVal = part.thoughtSignature
    } else if ('thought_signature' in part) {
      sigKey = 'thought_signature'
      sigVal = part.thought_signature
    }

    const hasText = typeof part.text === 'string' && part.text.length > 0
    const hasInline = typeof part.inlineData === 'object' || typeof part.inline_data === 'object' ||
      typeof part.fileData === 'object' || typeof part.file_data === 'object'

    if (hasText && sigKey && textKey === undefined) {
      textKey = sigKey
      textVal = sigVal
    }
    if (hasInline && sigKey && sigVal !== undefined) {
      images.push({ k: sigKey, v: sigVal })
    }
  }

  return buildGeminiThoughtSigComment({ textKey, textValue: textVal, imageSigs: images })
}

// ========== Model Helpers ==========

function getThinkingModelCategory(model: string): 'pro' | 'flash' | 'flashLite' | 'robotics' | 'other' {
  const normalized = model.toLowerCase()
  if (normalized.includes('robotics-er-1.5-preview')) return 'robotics'
  if (normalized.includes('-2.5-flash-lite') || normalized.includes('flash-lite-latest')) return 'flashLite'
  if (normalized.includes('-2.5-flash') || normalized.includes('flash-latest')) return 'flash'
  if (normalized.includes('-2.5-pro') || normalized.includes('pro-latest')) return 'pro'
  return 'other'
}

function isGemini3Model(model: string): boolean {
  return model.toLowerCase().includes('-3-')
}

function budgetToThinkingLevel(budget?: number): string {
  // Gemini 3: auto/high map to high; other levels map to low.
  if (budget === undefined || budget === -1 || budget === EFFORT_HIGH) return 'high'
  return 'low'
}

function resolveThinkingBudget(model: string, userBudget?: number): number | null {
  const category = getThinkingModelCategory(model)
  const hasBudget = userBudget !== undefined

  switch (category) {
    case 'pro':
      if (!hasBudget) return -1
      if (userBudget === -1) return -1
      return Math.max(PRO_THINKING_MIN, Math.min(PRO_THINKING_MAX, userBudget))
    case 'flash':
      if (!hasBudget) return -1
      if (userBudget === -1 || userBudget === 0) return userBudget
      return Math.max(0, Math.min(FLASH_THINKING_MAX, userBudget))
    case 'flashLite':
    case 'robotics':
      if (!hasBudget) return 0
      if (userBudget === -1 || userBudget === 0) return userBudget
      return Math.max(FLASH_LITE_THINKING_MIN, Math.min(FLASH_LITE_THINKING_MAX, userBudget))
    default:
      if (!hasBudget) return null
      return Math.max(0, Math.min(FLASH_THINKING_MAX, userBudget))
  }
}

function parseCitations(gm: unknown): Array<{ id: string; index: number; title: string; url: string }> {
  const out: Array<{ id: string; index: number; title: string; url: string }> = []
  if (!gm || typeof gm !== 'object') return out

  const chunks = (gm as Record<string, unknown>).groundingChunks
  if (!Array.isArray(chunks)) return out

  let idx = 1
  const seen = new Set<string>()
  for (const ch of chunks) {
    if (!ch || typeof ch !== 'object') continue
    const chObj = ch as Record<string, unknown>
    const web = (chObj.web ?? chObj.webSite ?? chObj.webPage) as Record<string, unknown> | undefined
    if (!web || typeof web !== 'object') continue

    const uri = ((web.uri ?? web.url) as string || '').toString()
    if (!uri || seen.has(uri)) continue
    seen.add(uri)

    const title = ((web.title ?? web.name ?? uri) as string).toString()
    const id = `c${idx.toString().padStart(2, '0')}`
    out.push({ id, index: idx, title, url: uri })
    idx++
  }
  return out
}

function parseTextAndImages(raw: string): { text: string; images: Array<{ type: 'url' | 'data' | 'path'; value: string }> } {
  const images: Array<{ type: 'url' | 'data' | 'path'; value: string }> = []
  let text = raw

  const mdImageRe = /!\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = mdImageRe.exec(raw)) !== null) {
    const src = match[1]
    if (src.startsWith('data:')) {
      images.push({ type: 'data', value: src })
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      images.push({ type: 'url', value: src })
    } else {
      images.push({ type: 'path', value: src })
    }
    text = text.replace(match[0], '')
  }

  const customImageRe = /\[image:([^\]]+)\]/g
  while ((match = customImageRe.exec(raw)) !== null) {
    images.push({ type: 'path', value: match[1] })
    text = text.replace(match[0], '')
  }

  return { text: text.trim(), images }
}

/** ArrayBuffer → base64 (浏览器兼容) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Download remote file as base64 */
async function downloadRemoteAsBase64(
  url: string,
  config: ProviderConfigV2,
  signal?: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {}

  if (config.vertexAI) {
    const token = await maybeVertexAccessToken(config)
    if (token) headers['Authorization'] = `Bearer ${token}`
    const proj = (config.projectId ?? '').trim()
    if (proj) headers['X-Goog-User-Project'] = proj
  }

  const resp = await fetch(url, { headers, signal })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const buffer = await resp.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

async function maybeVertexAccessToken(cfg: ProviderConfigV2): Promise<string | null> {
  if (!cfg.vertexAI) return null
  const jsonStr = (cfg.serviceAccountJson ?? '').trim()
  if (!jsonStr) {
    if (cfg.apiKey) return cfg.apiKey
    return null
  }
  if (cfg.apiKey) return cfg.apiKey
  return null
}

export type GoogleStreamParams = SendStreamParams

/**
 * Send streaming request to Google Gemini/Vertex AI.
 */
export async function* sendStream(params: GoogleStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImages,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations = 10,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    signal,
    resolveImagePath
  } = params

  const upstreamModelId = apiModelId(config, modelId)

  let baseUrl: string
  if (config.vertexAI && config.location?.trim() && config.projectId?.trim()) {
    const loc = config.location.trim()
    const proj = config.projectId.trim()
    baseUrl = `https://aiplatform.googleapis.com/v1/projects/${proj}/locations/${loc}/publishers/google/models/${upstreamModelId}:streamGenerateContent`
  } else {
    const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl
    baseUrl = `${base}/models/${upstreamModelId}:streamGenerateContent`
  }

  const url = new URL(baseUrl)
  if (!config.vertexAI) {
    const eff = effectiveApiKey(config)
    if (eff) url.searchParams.set('key', eff)
  }
  url.searchParams.set('alt', 'sse')

  const persistGeminiThoughtSigs = upstreamModelId.toLowerCase().includes('gemini-3')

  // Convert messages to Google contents format
  const contents: Array<Record<string, unknown>> = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const msgRole = msg.role
    const isLast = i === messages.length - 1
    const rawContent = typeof msg.content === 'string' ? msg.content : ''

    const meta = extractGeminiThoughtMeta(rawContent)
    const raw = meta.cleanedText

    // Handle tool result messages
    if (msgRole === 'tool') {
      const toolName = msg.name || ''
      let responseObj: Record<string, unknown>
      try { responseObj = JSON.parse(raw) } catch { responseObj = { result: raw } }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: toolName, response: responseObj } }]
      })
      continue
    }

    // Handle assistant messages with tool_calls
    const toolCalls = msg.tool_calls
    if (msgRole === 'assistant' && toolCalls?.length) {
      if (raw) {
        contents.push({ role: 'model', parts: [{ text: raw }] })
      }

      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined
        if (!fn) continue

        const name = (fn.name as string) || ''
        const argsRaw = fn.arguments
        let args: Record<string, unknown>
        if (typeof argsRaw === 'object' && argsRaw) {
          args = argsRaw as Record<string, unknown>
        } else if (typeof argsRaw === 'string' && argsRaw) {
          try { args = JSON.parse(argsRaw) } catch { args = {} }
        } else {
          args = {}
        }

        const functionCallObj = { name, args }
        const partObj: Record<string, unknown> = { functionCall: functionCallObj }

        const tcRec = tc as unknown as Record<string, unknown>

        if (fn['thought_signature'] !== undefined) {
          partObj.thought_signature = fn['thought_signature']
        } else if (fn['thoughtSignature'] !== undefined) {
          partObj.thoughtSignature = fn['thoughtSignature']
        } else if (tcRec['thought_signature'] !== undefined) {
          partObj.thought_signature = tcRec['thought_signature']
        } else if (tcRec['thoughtSignature'] !== undefined) {
          partObj.thoughtSignature = tcRec['thoughtSignature']
        } else if (persistGeminiThoughtSigs) {
          partObj.thoughtSignature = 'context_engineering_is_the_way_to_go'
        }

        contents.push({ role: 'model', parts: [partObj] })
      }
      continue
    }

    // Handle regular user/assistant messages
    const role = msgRole === 'assistant' ? 'model' : 'user'
    const parts: Array<Record<string, unknown>> = []

    const hasMarkdownImages = raw.includes('![') && raw.includes('](')
    const hasCustomImages = raw.includes('[image:')
    const hasAttachedImages = isLast && role === 'user' && userImages?.length

    if (hasMarkdownImages || hasCustomImages || hasAttachedImages) {
      const parsed = parseTextAndImages(raw)
      if (parsed.text) parts.push({ text: parsed.text })

      for (const ref of parsed.images) {
        if (ref.type === 'data') {
          const idx = ref.value.indexOf('base64,')
          if (idx > 0) {
            const mime = ref.value.substring(5, ref.value.indexOf(';'))
            const b64 = ref.value.substring(idx + 7)
            parts.push({ inline_data: { mime_type: mime, data: b64 } })
          } else {
            parts.push({ text: ref.value })
          }
        } else if (ref.type === 'path') {
          if (resolveImagePath) {
            const img = await resolveImagePath(ref.value)
            parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } })
          } else {
            parts.push({ text: `(image) ${ref.value}` })
          }
        } else {
          parts.push({ text: `(image) ${ref.value}` })
        }
      }

      if (hasAttachedImages) {
        for (const img of userImages!) {
          parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } })
        }
      }
    } else {
      if (raw) parts.push({ text: raw })
    }

    if (role === 'model' && parts.length > 0) {
      applyGeminiThoughtSignatures(meta, parts, persistGeminiThoughtSigs)
    }

    if (parts.length > 0) {
      contents.push({ role, parts })
    }
  }

  // Thinking config
  const isGemini3 = isGemini3Model(upstreamModelId)
  const budgetForGemini25 = isGemini3 ? undefined : effortToBudget(thinkingBudget, upstreamModelId)
  const resolvedBudget = isGemini3 ? undefined : resolveThinkingBudget(upstreamModelId, budgetForGemini25 ?? undefined)
  const off = isGemini3 ? (thinkingBudget === 0) : (resolvedBudget === 0)

  // Tools (built-ins and function declarations are mutually exclusive)
  const builtIns = builtInTools(config, modelId)
  const isOfficialGemini = !config.vertexAI
  const geminiToolsPayload = resolveGeminiToolsPayload({
    isOfficialGemini,
    builtIns,
    tools,
    normalizeParameters: cleanSchemaForGemini
  })

  // Multi-round tool loop
  let convo = [...contents]
  let usage: TokenUsage = emptyUsage()
  let totalTokens = 0
  const builtinCitations: Array<{ id: string; index: number; title: string; url: string }> = []

  let responseTextThoughtSigKey: string | undefined
  let responseTextThoughtSigVal: unknown
  const responseImageThoughtSigs: Array<{ k: string; v: unknown }> = []

  let iterations = 0

  while (iterations < maxToolLoopIterations) {
    iterations++

    const gen: Record<string, unknown> = {}
    if (temperature !== undefined) gen.temperature = temperature
    if (topP !== undefined) gen.topP = topP
    if (maxTokens && maxTokens > 0) gen.maxOutputTokens = maxTokens

    const isReasoning = upstreamModelId.toLowerCase().includes('-2.5-') ||
      upstreamModelId.toLowerCase().includes('-3-')
    if (isReasoning) {
      const thinkingConfig: Record<string, unknown> = { includeThoughts: !off }
      if (isGemini3) {
        // Gemini 3 仅使用 low/high；auto/high -> high，其余 -> low。
        thinkingConfig.thinkingLevel = budgetToThinkingLevel(thinkingBudget)
      } else if (!off && resolvedBudget !== null && resolvedBudget !== 0) {
        thinkingConfig.thinkingBudget = resolvedBudget
      }
      gen.thinkingConfig = thinkingConfig
    }

    const body: Record<string, unknown> = { contents: convo }
    if (Object.keys(gen).length > 0) body.generationConfig = gen
    if (geminiToolsPayload.builtInToolEntries.length > 0) {
      body.tools = geminiToolsPayload.builtInToolEntries
    } else if (geminiToolsPayload.functionToolEntries.length > 0) {
      body.tools = geminiToolsPayload.functionToolEntries
    }

    const hdrs: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    }
    if (config.vertexAI) {
      const token = await maybeVertexAccessToken(config)
      if (token) hdrs['Authorization'] = `Bearer ${token}`
      const proj = (config.projectId ?? '').trim()
      if (proj) hdrs['X-Goog-User-Project'] = proj
    }
    Object.assign(hdrs, customHeaders(config, modelId))
    if (extraHeaders) Object.assign(hdrs, extraHeaders)

    const extraBodyCfg = customBody(config, modelId)
    Object.assign(body, extraBodyCfg)
    if (extraBody) {
      for (const [k, v] of Object.entries(extraBody)) {
        body[k] = typeof v === 'string' ? parseOverrideValue(v) : v
      }
    }

    const resp = await postJsonStream({
      url: url.toString(),
      headers: hdrs,
      body,
      config,
      signal
    })

    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      const errorBody = await readErrorBody(resp.rawStream)
      throw new Error(`HTTP ${resp.statusCode}: ${errorBody}`)
    }

    // Process stream with state object for real-time streaming
    const streamState: GeminiStreamState = {
      usage: emptyUsage(),
      citations: [],
      toolCalls: [],
      modelParts: [],
      imageThoughtSigs: [],
      toolIdx: 0
    }

    // Yield chunks in real-time as they arrive
    yield* processGeminiStream({
      lines: resp.lines,
      persistGeminiThoughtSigs,
      config,
      signal,
      state: streamState
    })

    // After stream completes, merge accumulated state
    usage = mergeUsage(usage, streamState.usage)
    totalTokens = usage.totalTokens

    // Collect citations
    builtinCitations.push(...streamState.citations)

    // Collect thought signatures
    if (streamState.textThoughtSigKey && responseTextThoughtSigKey === undefined) {
      responseTextThoughtSigKey = streamState.textThoughtSigKey
      responseTextThoughtSigVal = streamState.textThoughtSigVal
    }
    responseImageThoughtSigs.push(...streamState.imageThoughtSigs)

    // Handle tool calls
    if (streamState.toolCalls.length > 0 && onToolCall) {
      const callInfos = streamState.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.args
      }))
      yield { content: '', isDone: false, totalTokens, usage, toolCalls: callInfos }

      const toolResultParts: Array<Record<string, unknown>> = []
      const toolResultInfos: Array<{ id: string; name: string; arguments: Record<string, unknown>; content: string }> = []

      for (const tc of streamState.toolCalls) {
        const res = await onToolCall(tc.name, tc.args)
        toolResultParts.push({
          functionResponse: {
            name: tc.name,
            response: (() => { try { return JSON.parse(res) } catch { return { result: res } } })()
          }
        })
        toolResultInfos.push({ id: tc.id, name: tc.name, arguments: tc.args, content: res })
      }

      yield { content: '', isDone: false, totalTokens, usage, toolResults: toolResultInfos }

      // Add model response + tool results to conversation
      if (streamState.modelParts.length > 0) {
        convo.push({ role: 'model', parts: streamState.modelParts })
      }
      convo.push({ role: 'user', parts: toolResultParts })
      continue
    }

    // No tool calls - done
    break
  }

  // Build final thought signature comment
  const sigComment = buildGeminiThoughtSigComment({
    textKey: responseTextThoughtSigKey,
    textValue: responseTextThoughtSigVal,
    imageSigs: responseImageThoughtSigs
  })

  // Yield citations if any
  if (builtinCitations.length > 0) {
    yield {
      content: '',
      isDone: false,
      totalTokens,
      usage,
      toolResults: [{
        id: 'builtin_search',
        name: 'search_web',
        arguments: {},
        content: JSON.stringify({ items: builtinCitations })
      }]
    }
  }

  // sigComment contains thought_signature metadata needed for multi-turn conversations
  // It MUST be included in content for persistence, but frontend should filter it from display
  yield { content: sigComment, isDone: true, totalTokens, usage }
}

// ========== Stream Processing ==========

interface GeminiStreamState {
  usage: TokenUsage
  citations: Array<{ id: string; index: number; title: string; url: string }>
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; partObj: Record<string, unknown> }>
  modelParts: Array<Record<string, unknown>>
  textThoughtSigKey?: string
  textThoughtSigVal?: unknown
  imageThoughtSigs: Array<{ k: string; v: unknown }>
  toolIdx: number
}

async function* processGeminiStream(params: {
  lines: AsyncGenerator<string, void, unknown>
  persistGeminiThoughtSigs: boolean
  config: ProviderConfigV2
  signal?: AbortSignal
  state: GeminiStreamState
}): AsyncGenerator<ChatStreamChunk> {
  const { lines, persistGeminiThoughtSigs, config, signal, state } = params

  for await (const line of lines) {
    if (!line.startsWith('data:')) continue
    const raw = line.substring(5).trim()
    if (!raw || raw === '[DONE]') continue

    let json: Record<string, unknown>
    try {
      json = JSON.parse(raw)
    } catch {
      continue
    }

    // Extract candidates
    const candidates = json.candidates as Array<Record<string, unknown>> | undefined
    if (candidates && candidates.length > 0) {
      const c0 = candidates[0]
      const content = c0.content as Record<string, unknown> | undefined
      const parts = content?.parts as Array<Record<string, unknown>> | undefined

      if (parts) {
        for (const part of parts) {
          // Text content
          if (typeof part.text === 'string' && part.text.length > 0) {
            const isThought = part.thought === true
            if (isThought) {
              yield { content: '', reasoning: part.text as string, isDone: false, totalTokens: state.usage.totalTokens, usage: state.usage }
            } else {
              yield { content: part.text as string, isDone: false, totalTokens: state.usage.totalTokens, usage: state.usage }
              state.modelParts.push({ text: part.text })
            }

            // Collect thought signature from text part
            let sigKey: string | undefined
            let sigVal: unknown
            if ('thoughtSignature' in part) {
              sigKey = 'thoughtSignature'
              sigVal = part.thoughtSignature
            } else if ('thought_signature' in part) {
              sigKey = 'thought_signature'
              sigVal = part.thought_signature
            }
            if (sigKey && state.textThoughtSigKey === undefined) {
              state.textThoughtSigKey = sigKey
              state.textThoughtSigVal = sigVal
            }
          }

          // Function call
          const fc = part.functionCall as Record<string, unknown> | undefined
          if (fc) {
            const name = (fc.name as string) || ''
            const args = (fc.args as Record<string, unknown>) || {}
            const id = `tool_${state.toolIdx++}`
            state.toolCalls.push({ id, name, args, partObj: { ...part } })
            state.modelParts.push({ ...part })

            // Collect thought signature from functionCall part
            let sigKey: string | undefined
            let sigVal: unknown
            if ('thoughtSignature' in part) {
              sigKey = 'thoughtSignature'
              sigVal = part.thoughtSignature
            } else if ('thought_signature' in part) {
              sigKey = 'thought_signature'
              sigVal = part.thought_signature
            }
            if (sigKey && sigVal !== undefined) {
              state.imageThoughtSigs.push({ k: sigKey, v: sigVal })
            }
          }

          // Inline data (image response from model)
          const inlineData = (part.inlineData ?? part.inline_data) as Record<string, unknown> | undefined
          if (inlineData) {
            const mime = (inlineData.mimeType ?? inlineData.mime_type) as string || 'image/png'
            const data = inlineData.data as string | undefined
            if (data) {
              const dataUrl = `data:${mime};base64,${data}`
              yield { content: `\n![image](${dataUrl})\n`, isDone: false, totalTokens: state.usage.totalTokens, usage: state.usage }
            }

            // Collect thought signature
            let sigKey: string | undefined
            let sigVal: unknown
            if ('thoughtSignature' in part) {
              sigKey = 'thoughtSignature'
              sigVal = part.thoughtSignature
            } else if ('thought_signature' in part) {
              sigKey = 'thought_signature'
              sigVal = part.thought_signature
            }
            if (sigKey && sigVal !== undefined) {
              state.imageThoughtSigs.push({ k: sigKey, v: sigVal })
            }
          }

          // File data (remote file reference)
          const fileData = (part.fileData ?? part.file_data) as Record<string, unknown> | undefined
          if (fileData) {
            const fileUri = (fileData.fileUri ?? fileData.file_uri) as string | undefined
            const mime = (fileData.mimeType ?? fileData.mime_type) as string || 'image/png'
            if (fileUri) {
              try {
                const b64 = await downloadRemoteAsBase64(fileUri, config, signal)
                const dataUrl = `data:${mime};base64,${b64}`
                yield { content: `\n![image](${dataUrl})\n`, isDone: false, totalTokens: state.usage.totalTokens, usage: state.usage }
              } catch {
                yield { content: `\n(image: ${fileUri})\n`, isDone: false, totalTokens: state.usage.totalTokens, usage: state.usage }
              }
            }
          }
        }
      }

      // Grounding metadata (citations)
      const gm = c0.groundingMetadata as Record<string, unknown> | undefined
      if (gm) {
        const cits = parseCitations(gm)
        state.citations.push(...cits)
      }
    }

    // Usage metadata
    const um = json.usageMetadata as Record<string, unknown> | undefined
    if (um) {
      const prompt = (um.promptTokenCount as number) ?? 0
      const completion = (um.candidatesTokenCount as number) ?? 0
      const cached = (um.cachedContentTokenCount as number) ?? 0
      const thinking = (um.thoughtsTokenCount as number) ?? 0
      state.usage = mergeUsage(state.usage, {
        promptTokens: prompt,
        completionTokens: completion + thinking,
        cachedTokens: cached,
        totalTokens: prompt + completion + thinking
      })
    }
  }
}
