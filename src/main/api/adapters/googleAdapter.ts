/**
 * Google (Gemini/Vertex AI) Provider Adapter
 * Handles streaming chat completions for Google Gemini and Vertex AI.
 */

import type { ProviderConfigV2 } from '../../../shared/types'
import type {
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn,
  TokenUsage
} from '../../../shared/chatStream'
import { emptyUsage, mergeUsage } from '../../../shared/chatStream'
import { postJsonStream, parseSSELine } from '../streamingHttpClient'
import {
  apiModelId,
  effectiveApiKey,
  customHeaders,
  customBody,
  parseOverrideValue,
  mimeFromPath,
  encodeBase64File,
  builtInTools,
  cleanSchemaForGemini,
  EFFORT_MINIMAL,
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  effortToBudget
} from '../helpers/chatApiHelper'

// ========== Thinking Budget Constants (from LobeChat) ==========
const PRO_THINKING_MIN = 128
const PRO_THINKING_MAX = 32768
const FLASH_THINKING_MAX = 24576
const FLASH_LITE_THINKING_MIN = 512
const FLASH_LITE_THINKING_MAX = 24576

// ========== Gemini thought_signature 处理 ==========
const GEMINI_THOUGHT_SIG_TAG = 'gemini_thought_signatures'
const GEMINI_THOUGHT_SIG_COMMENT = /<!--\s*gemini_thought_signatures:(.*?)-->/gs

/** Gemini thought_signature 签名元数据 */
interface GeminiSignatureMeta {
  cleanedText: string
  textKey?: string
  textValue?: unknown
  images: Array<{ k: string; v: unknown }>
}

/** 从消息内容中提取签名元数据 */
function extractGeminiThoughtMeta(raw: string): GeminiSignatureMeta {
  try {
    const matches = [...raw.matchAll(GEMINI_THOUGHT_SIG_COMMENT)]
    if (matches.length === 0) return { cleanedText: raw, images: [] }
    
    const m = matches[matches.length - 1]
    const payloadRaw = (m[1] || '').trim()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(payloadRaw)
    } catch { /* empty */ }
    
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

/** 构建 HTML 注释格式的签名 */
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

/** 将签名应用到 Gemini parts */
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

/** 从响应 parts 中收集签名信息 */
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

/** Get thinking model category based on model ID */
function getThinkingModelCategory(model: string): 'pro' | 'flash' | 'flashLite' | 'robotics' | 'other' {
  const normalized = model.toLowerCase()
  if (normalized.includes('robotics-er-1.5-preview')) return 'robotics'
  if (normalized.includes('-2.5-flash-lite') || normalized.includes('flash-lite-latest')) return 'flashLite'
  if (normalized.includes('-2.5-flash') || normalized.includes('flash-latest')) return 'flash'
  if (normalized.includes('-2.5-pro') || normalized.includes('pro-latest')) return 'pro'
  return 'other'
}

/** Check if model is Gemini 3.x */
function isGemini3Model(model: string): boolean {
  return model.toLowerCase().includes('-3-')
}

/** Convert budget value to thinkingLevel for Gemini 3.x models */
function budgetToThinkingLevel(budget?: number): string {
  if (budget === undefined || budget === -1) return 'high' // auto = high
  if (budget === 0) return 'low' // off -> low (Gemini 3 can't disable)
  if (budget === EFFORT_MINIMAL) return 'minimal'
  if (budget === EFFORT_LOW) return 'low'
  if (budget === EFFORT_MEDIUM) return 'medium'
  if (budget === EFFORT_HIGH) return 'high'
  // Handle raw budget values
  if (budget < 4096) return 'low'
  if (budget < 16384) return 'medium'
  return 'high'
}

/** Resolve thinking budget for Gemini models */
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

/** Parse grounding citations from response */
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

/** Parse text and images from message content */
function parseTextAndImages(raw: string): { text: string; images: Array<{ type: 'url' | 'data' | 'path'; value: string }> } {
  const images: Array<{ type: 'url' | 'data' | 'path'; value: string }> = []
  let text = raw
  
  // Parse markdown images ![...](...)
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
  
  // Parse [image:path] format
  const customImageRe = /\[image:([^\]]+)\]/g
  while ((match = customImageRe.exec(raw)) !== null) {
    images.push({ type: 'path', value: match[1] })
    text = text.replace(match[0], '')
  }
  
  return { text: text.trim(), images }
}

/** Download remote file as base64 (for fileData responses) */
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
  return Buffer.from(buffer).toString('base64')
}

/** Get Vertex AI access token from service account JSON */
async function maybeVertexAccessToken(cfg: ProviderConfigV2): Promise<string | null> {
  if (!cfg.vertexAI) return null
  
  const jsonStr = (cfg.serviceAccountJson ?? '').trim()
  if (!jsonStr) {
    // Fall back to API key
    if (cfg.apiKey) return cfg.apiKey
    return null
  }
  
  // TODO: Implement Google Service Account JWT authentication
  // For now, fall back to API key
  if (cfg.apiKey) return cfg.apiKey
  return null
}

/** Send streaming parameters */
export interface GoogleStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImagePaths?: string[]
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  maxToolLoopIterations?: number
  tools?: ToolDefinition[]
  onToolCall?: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * Send streaming request to Google Gemini/Vertex AI.
 */
export async function* sendStream(params: GoogleStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    userImagePaths,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    maxToolLoopIterations = 10,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    signal
  } = params
  
  const upstreamModelId = apiModelId(config, modelId)
  
  // Build endpoint
  let baseUrl: string
  if (config.vertexAI && config.location?.trim() && config.projectId?.trim()) {
    const loc = config.location.trim()
    const proj = config.projectId.trim()
    baseUrl = `https://aiplatform.googleapis.com/v1/projects/${proj}/locations/${loc}/publishers/google/models/${upstreamModelId}:streamGenerateContent`
  } else {
    const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl
    baseUrl = `${base}/models/${upstreamModelId}:streamGenerateContent`
  }
  
  // Build query params
  const url = new URL(baseUrl)
  if (!config.vertexAI) {
    const eff = effectiveApiKey(config)
    if (eff) url.searchParams.set('key', eff)
  }
  url.searchParams.set('alt', 'sse')
  
  // 判断是否需要持久化 thought_signature
  const persistGeminiThoughtSigs = upstreamModelId.toLowerCase().includes('gemini-3')
  
  // Convert messages to Google contents format
  const contents: Array<Record<string, unknown>> = []
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const msgRole = msg.role
    const isLast = i === messages.length - 1
    const rawContent = typeof msg.content === 'string' ? msg.content : ''
    
    // 提取签名元数据
    const meta = extractGeminiThoughtMeta(rawContent)
    const raw = meta.cleanedText
    
    // Handle tool result messages
    if (msgRole === 'tool') {
      const toolName = (msg as Record<string, unknown>).name as string || ''
      let responseObj: Record<string, unknown>
      try {
        responseObj = JSON.parse(raw)
      } catch {
        responseObj = { result: raw }
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: toolName, response: responseObj } }]
      })
      continue
    }
    
    // Handle assistant messages with tool_calls
    const toolCalls = (msg as Record<string, unknown>).tool_calls as Array<Record<string, unknown>> | undefined
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
        
        // Preserve thought_signature at part level
        if (fn.thought_signature !== undefined) {
          partObj.thought_signature = fn.thought_signature
        } else if (fn.thoughtSignature !== undefined) {
          partObj.thoughtSignature = fn.thoughtSignature
        } else if (tc.thought_signature !== undefined) {
          partObj.thought_signature = tc.thought_signature
        } else if (tc.thoughtSignature !== undefined) {
          partObj.thoughtSignature = tc.thoughtSignature
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
    const hasAttachedImages = isLast && role === 'user' && userImagePaths?.length
    
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
          const mime = mimeFromPath(ref.value)
          const b64 = await encodeBase64File(ref.value, false)
          parts.push({ inline_data: { mime_type: mime, data: b64 } })
        } else {
          parts.push({ text: `(image) ${ref.value}` })
        }
      }
      
      if (hasAttachedImages) {
        for (const p of userImagePaths!) {
          if (p.startsWith('data:')) {
            const idx = p.indexOf('base64,')
            if (idx > 0) {
              const mime = p.substring(5, p.indexOf(';'))
              const b64 = p.substring(idx + 7)
              parts.push({ inline_data: { mime_type: mime, data: b64 } })
            }
          } else if (!p.startsWith('http://') && !p.startsWith('https://')) {
            const mime = mimeFromPath(p)
            const b64 = await encodeBase64File(p, false)
            parts.push({ inline_data: { mime_type: mime, data: b64 } })
          } else {
            parts.push({ text: `(image) ${p}` })
          }
        }
      }
    } else {
      if (raw) parts.push({ text: raw })
    }
    
    // Apply signatures to model messages
    if (role === 'model' && parts.length > 0) {
      applyGeminiThoughtSignatures(meta, parts, persistGeminiThoughtSigs)
    }
    
    if (parts.length > 0) {
      contents.push({ role, parts })
    }
  }
  
  // Check Gemini 3 and thinking config
  const isGemini3 = isGemini3Model(upstreamModelId)
  const budgetForGemini25 = isGemini3 ? undefined : effortToBudget(thinkingBudget, upstreamModelId)
  const resolvedBudget = isGemini3 ? undefined : resolveThinkingBudget(upstreamModelId, budgetForGemini25 ?? undefined)
  const off = isGemini3 ? (thinkingBudget === 0) : (resolvedBudget === 0)
  
  // Built-in tools
  const builtIns = builtInTools(config, modelId)
  const isOfficialGemini = !config.vertexAI
  const builtInToolEntries: Array<Record<string, unknown>> = []
  if (isOfficialGemini && builtIns.length > 0) {
    if (builtIns.includes('search')) {
      builtInToolEntries.push({ google_search: {} })
    }
    if (builtIns.includes('url_context')) {
      builtInToolEntries.push({ url_context: {} })
    }
  }
  
  // Map tools to Gemini format
  let geminiTools: Array<Record<string, unknown>> | undefined
  if (builtInToolEntries.length === 0 && tools?.length) {
    const decls: Array<Record<string, unknown>> = []
    for (const t of tools) {
      const fn = t.function
      if (!fn?.name) continue
      const d: Record<string, unknown> = { name: fn.name }
      if (fn.description) d.description = fn.description
      if (fn.parameters) {
        d.parameters = cleanSchemaForGemini(fn.parameters as Record<string, unknown>)
      }
      decls.push(d)
    }
    if (decls.length > 0) geminiTools = [{ function_declarations: decls }]
  }
  
  // Multi-round tool loop
  let convo = [...contents]
  let usage: TokenUsage = emptyUsage()
  let totalTokens = 0
  const builtinCitations: Array<{ id: string; index: number; title: string; url: string }> = []
  
  // Signature collection
  let responseTextThoughtSigKey: string | undefined
  let responseTextThoughtSigVal: unknown
  const responseImageThoughtSigs: Array<{ k: string; v: unknown }> = []
  
  let iterations = 0
  
  while (iterations < maxToolLoopIterations) {
    iterations++
    
    // Build generation config
    const gen: Record<string, unknown> = {}
    if (temperature !== undefined) gen.temperature = temperature
    if (topP !== undefined) gen.topP = topP
    if (maxTokens && maxTokens > 0) gen.maxOutputTokens = maxTokens
    
    // Check if reasoning model
    const isReasoning = upstreamModelId.toLowerCase().includes('-2.5-') || 
                        upstreamModelId.toLowerCase().includes('-3-')
    if (isReasoning) {
      const thinkingConfig: Record<string, unknown> = {
        includeThoughts: !off
      }
      if (isGemini3 && !off) {
        thinkingConfig.thinkingLevel = budgetToThinkingLevel(thinkingBudget)
      } else if (!off && resolvedBudget !== null && resolvedBudget !== 0) {
        thinkingConfig.thinkingBudget = resolvedBudget
      }
      gen.thinkingConfig = thinkingConfig
    }
    
    const body: Record<string, unknown> = {
      contents: convo
    }
    if (Object.keys(gen).length > 0) body.generationConfig = gen
    if (builtInToolEntries.length > 0) {
      body.tools = builtInToolEntries
    } else if (geminiTools?.length) {
      body.tools = geminiTools
    }
    
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    }
    if (config.vertexAI) {
      const token = await maybeVertexAccessToken(config)
      if (token) headers['Authorization'] = `Bearer ${token}`
      const proj = (config.projectId ?? '').trim()
      if (proj) headers['X-Goog-User-Project'] = proj
    }
    Object.assign(headers, customHeaders(config, modelId))
    if (extraHeaders) Object.assign(headers, extraHeaders)
    
    // Apply custom body
    const extra = customBody(config, modelId)
    if (Object.keys(extra).length > 0) Object.assign(body, extra)
    if (extraBody) {
      for (const [k, v] of Object.entries(extraBody)) {
        body[k] = typeof v === 'string' ? parseOverrideValue(v) : v
      }
    }
    
    // Send request
    const resp = await postJsonStream({
      url: url.toString(),
      headers,
      body,
      signal
    })
    
    if (!resp.ok) {
      const errorBody = await resp.text()
      throw new Error(`HTTP ${resp.status}: ${errorBody}`)
    }
    
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('No response body')
    
    const decoder = new TextDecoder()
    let buffer = ''
    const calls: Array<{
      id: string
      name: string
      args: Record<string, unknown>
      result: string
      thoughtSigKey?: string
      thoughtSigVal?: unknown
    }> = []
    let imageOpen = false
    let imageMime = 'image/png'
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          
          const data = trimmed.substring(5).trim()
          if (!data) continue
          
          try {
            const obj = JSON.parse(data) as Record<string, unknown>
            
            // Parse usage
            const um = obj.usageMetadata as Record<string, unknown> | undefined
            if (um) {
              const thoughtTokens = (um.thoughtsTokenCount as number) || 0
              const candidateTokens = (um.candidatesTokenCount as number) || 0
              usage = mergeUsage(usage, {
                promptTokens: (um.promptTokenCount as number) || 0,
                completionTokens: candidateTokens + thoughtTokens,
                thoughtTokens,
                totalTokens: (um.totalTokenCount as number) || 0
              })
              totalTokens = usage.totalTokens
            }
            
            // Parse candidates
            const candidates = obj.candidates as Array<Record<string, unknown>> | undefined
            if (candidates?.length) {
              let textDelta = ''
              let reasoningDelta = ''
              let finishReason: string | undefined
              
              for (const cand of candidates) {
                const content = cand.content as Record<string, unknown> | undefined
                const parts = content?.parts as Array<Record<string, unknown>> | undefined
                if (!parts) continue
                
                for (const p of parts) {
                  const t = (p.text as string) || ''
                  const thought = p.thought as boolean || false
                  
                  if (t) {
                    if (thought) {
                      reasoningDelta += t
                    } else {
                      textDelta += t
                    }
                    
                    // Collect text part signature
                    if (persistGeminiThoughtSigs && !responseTextThoughtSigKey) {
                      if ('thoughtSignature' in p) {
                        responseTextThoughtSigKey = 'thoughtSignature'
                        responseTextThoughtSigVal = p.thoughtSignature
                      } else if ('thought_signature' in p) {
                        responseTextThoughtSigKey = 'thought_signature'
                        responseTextThoughtSigVal = p.thought_signature
                      }
                    }
                  }
                  
                  // Parse inline image
                  const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined
                  if (inline) {
                    const mime = ((inline.mimeType ?? inline.mime_type) as string) || 'image/png'
                    const imgData = (inline.data as string) || ''
                    if (imgData) {
                      imageMime = mime || 'image/png'
                      if (!imageOpen) {
                        textDelta += `\n\n![image](data:${imageMime};base64,`
                        imageOpen = true
                      }
                      textDelta += imgData
                      
                      // Collect inline_data signature
                      if (persistGeminiThoughtSigs) {
                        if ('thoughtSignature' in p) {
                          responseImageThoughtSigs.push({ k: 'thoughtSignature', v: p.thoughtSignature })
                        } else if ('thought_signature' in p) {
                          responseImageThoughtSigs.push({ k: 'thought_signature', v: p.thought_signature })
                        }
                      }
                    }
                  }
                  
                  // Parse fileData
                  const fileData = (p.fileData ?? p.file_data) as Record<string, unknown> | undefined
                  if (fileData) {
                    const mime = ((fileData.mimeType ?? fileData.mime_type) as string) || 'image/png'
                    const fileUri = ((fileData.fileUri ?? fileData.file_uri ?? fileData.uri) as string) || ''
                    if (fileUri.startsWith('http')) {
                      try {
                        const b64 = await downloadRemoteAsBase64(fileUri, config, signal)
                        imageMime = mime || 'image/png'
                        if (!imageOpen) {
                          textDelta += `\n\n![image](data:${imageMime};base64,`
                          imageOpen = true
                        }
                        textDelta += b64
                      } catch { /* ignore */ }
                    }
                  }
                  
                  // Function call
                  const fc = p.functionCall as Record<string, unknown> | undefined
                  if (fc) {
                    const name = (fc.name as string) || ''
                    let args: Record<string, unknown> = {}
                    const rawArgs = fc.args
                    if (typeof rawArgs === 'object' && rawArgs) {
                      args = rawArgs as Record<string, unknown>
                    } else if (typeof rawArgs === 'string' && rawArgs) {
                      try { args = JSON.parse(rawArgs) } catch { /* empty */ }
                    }
                    
                    let thoughtSigKey: string | undefined
                    let thoughtSigVal: unknown
                    if ('thoughtSignature' in fc) {
                      thoughtSigKey = 'thoughtSignature'
                      thoughtSigVal = fc.thoughtSignature
                    } else if ('thought_signature' in fc) {
                      thoughtSigKey = 'thought_signature'
                      thoughtSigVal = fc.thought_signature
                    }
                    
                    const id = `call_${Date.now()}`
                    yield {
                      content: '',
                      isDone: false,
                      totalTokens,
                      usage,
                      toolCalls: [{ id, name, arguments: args }]
                    }
                    
                    let resText = ''
                    if (onToolCall) {
                      resText = await onToolCall(name, args) || ''
                      yield {
                        content: '',
                        isDone: false,
                        totalTokens,
                        usage,
                        toolResults: [{ id, name, arguments: args, content: resText }]
                      }
                    }
                    
                    calls.push({
                      id,
                      name,
                      args,
                      result: resText,
                      thoughtSigKey,
                      thoughtSigVal
                    })
                  }
                }
                
                const fr = cand.finishReason as string | undefined
                if (fr) finishReason = fr
                
                // Parse grounding metadata
                const gm = cand.groundingMetadata ?? obj.groundingMetadata
                const cite = parseCitations(gm)
                if (cite.length > 0) {
                  const existingUrls = new Set(builtinCitations.map(e => e.url))
                  for (const it of cite) {
                    if (!it.url || existingUrls.has(it.url)) continue
                    builtinCitations.push(it)
                    existingUrls.add(it.url)
                  }
                  const payload = JSON.stringify({ items: builtinCitations })
                  yield {
                    content: '',
                    isDone: false,
                    totalTokens,
                    usage,
                    toolResults: [{ id: 'builtin_search', name: 'builtin_search', arguments: {}, content: payload }]
                  }
                }
              }
              
              if (reasoningDelta) {
                yield { content: '', reasoning: reasoningDelta, isDone: false, totalTokens, usage }
              }
              if (textDelta) {
                yield { content: textDelta, isDone: false, totalTokens, usage }
              }
              
              if (finishReason && calls.length === 0) {
                if (imageOpen) {
                  yield { content: ')', isDone: false, totalTokens, usage }
                  imageOpen = false
                }
                if (builtinCitations.length > 0) {
                  const payload = JSON.stringify({ items: builtinCitations })
                  yield {
                    content: '',
                    isDone: false,
                    totalTokens,
                    usage,
                    toolResults: [{ id: 'builtin_search', name: 'builtin_search', arguments: {}, content: payload }]
                  }
                }
                // Output signature comment
                if (persistGeminiThoughtSigs) {
                  const metaComment = buildGeminiThoughtSigComment({
                    textKey: responseTextThoughtSigKey,
                    textValue: responseTextThoughtSigVal,
                    imageSigs: responseImageThoughtSigs
                  })
                  if (metaComment) {
                    yield { content: metaComment, isDone: false, totalTokens, usage }
                  }
                }
                yield { content: '', isDone: true, totalTokens, usage }
                return
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } finally {
      reader.releaseLock()
    }
    
    if (imageOpen) {
      yield { content: ')', isDone: false, totalTokens, usage }
      imageOpen = false
    }
    
    if (calls.length === 0) {
      // Output signature comment
      if (persistGeminiThoughtSigs) {
        const metaComment = buildGeminiThoughtSigComment({
          textKey: responseTextThoughtSigKey,
          textValue: responseTextThoughtSigVal,
          imageSigs: responseImageThoughtSigs
        })
        if (metaComment) {
          yield { content: metaComment, isDone: false, totalTokens, usage }
        }
      }
      yield { content: '', isDone: true, totalTokens, usage }
      return
    }
    
    // Append function calls and responses to conversation
    for (const c of calls) {
      const functionCallObj = { name: c.name, args: c.args }
      const partObj: Record<string, unknown> = { functionCall: functionCallObj }
      
      if (c.thoughtSigKey && c.thoughtSigVal !== undefined) {
        partObj[c.thoughtSigKey] = c.thoughtSigVal
      } else if (persistGeminiThoughtSigs) {
        partObj.thoughtSignature = 'context_engineering_is_the_way_to_go'
      }
      
      convo.push({ role: 'model', parts: [partObj] })
      
      let responseObj: Record<string, unknown>
      try {
        responseObj = JSON.parse(c.result)
      } catch {
        responseObj = { result: c.result }
      }
      convo.push({
        role: 'user',
        parts: [{ functionResponse: { name: c.name, response: responseObj } }]
      })
    }
    
    // Clear calls for next iteration
    calls.length = 0
  }
  
  // Max iterations reached
  yield { content: '', isDone: true, totalTokens, usage }
}
