/**
 * OpenAI Responses API Handler (shared)
 * 处理 OpenAI Responses API 格式的流式请求
 * 零 Node.js 依赖，可在 Renderer 进程直接使用
 */

import type { ProviderConfigV2 } from '../../../types'
import type {
  ChatStreamChunk,
  TokenUsage,
  ToolCallInfo,
  ToolResultInfo,
  ChatMessage,
  ToolDefinition,
  OnToolCallFn
} from '../../../chatStream'
import { mergeUsage } from '../../../chatStream'
import {
  postJsonStream,
  parseSSELine,
  readErrorBody,
  joinUrl
} from '../../../streamingHttpClient'
import type { UserImage } from '../../chatApiService'
import * as helper from '../../../chatApiHelper'

/** 发送流式请求的参数 */
export interface SendStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  userImages?: UserImage[]
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
 * OpenAI Responses API 流式请求处理器
 */
export async function* sendStream(params: SendStreamParams): AsyncGenerator<ChatStreamChunk> {
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
    signal
  } = params

  const upstreamModelId = helper.apiModelId(config, modelId)
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = joinUrl(base, '/responses')

  const isReasoning = checkModelIsReasoning(modelId)
  const rawEffort = helper.effortForBudget(thinkingBudget)
  const effort = rawEffort === 'minimal' ? 'low' : rawEffort

  const { input, instructions } = buildInputMessages(messages, userImages)
  const toolList = buildToolList(tools, config, modelId)

  const body: Record<string, unknown> = {
    model: upstreamModelId,
    input,
    stream: true,
    ...(instructions && { instructions }),
    ...(temperature !== undefined && { temperature }),
    ...(topP !== undefined && { top_p: topP }),
    ...(maxTokens !== undefined && maxTokens > 0 && { max_output_tokens: maxTokens }),
    ...(toolList.length > 0 && {
      tools: toolList,
      tool_choice: 'auto'
    }),
    ...(isReasoning && effort !== 'off' && {
      reasoning: {
        summary: 'detailed',
        ...(effort !== 'auto' && { effort })
      }
    }),
    text: { verbosity: 'high' }
  }

  try {
    const ov = helper.modelOverride(config, modelId)
    const ws = ov['webSearch'] as Record<string, unknown> | undefined
    if (ws?.['include_sources'] === true) {
      body['include'] = ['web_search_call.action.sources']
    }
  } catch {
    // ignore
  }

  const apiKey = helper.effectiveApiKey(config)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...helper.customHeaders(config, modelId),
    ...extraHeaders
  }

  const extraBodyCfg = helper.customBody(config, modelId)
  Object.assign(body, extraBodyCfg)
  if (extraBody) {
    for (const [k, v] of Object.entries(extraBody)) {
      body[k] = typeof v === 'string' ? helper.parseOverrideValue(v) : v
    }
  }

  const response = await postJsonStream({
    url,
    headers,
    body,
    signal
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const errorBody = await readErrorBody(response.rawStream)
    throw new Error(`HTTP ${response.statusCode}: ${errorBody}`)
  }

  yield* processStream({
    config,
    modelId,
    messages,
    lines: response.lines,
    url,
    headers,
    toolList,
    systemInstructions: instructions,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  })
}

// ========== Stream Processing ==========

interface ProcessStreamParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  lines: AsyncGenerator<string, void, unknown>
  url: string
  headers: Record<string, string>
  toolList: Array<Record<string, unknown>>
  systemInstructions: string
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  onToolCall?: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
}

async function* processStream(params: ProcessStreamParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    lines,
    url,
    headers,
    toolList,
    systemInstructions,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    tools,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  } = params

  let usage: TokenUsage | undefined
  let totalTokens = 0

  const toolAccResp = new Map<string, { id: string; name: string; args: string }>()
  const itemIdToCallId = new Map<string, string>()

  for await (const line of lines) {
    const data = parseSSELine(line)

    if (data === null) {
      if (line.startsWith('data:') && line.substring(5).trim() === '[DONE]') {
        yield { content: '', isDone: true, totalTokens, usage }
        return
      }
      continue
    }

    try {
      const json = JSON.parse(data)
      const type = json.type as string

      switch (type) {
        case 'response.output_text.delta': {
          const delta = json.delta as string | undefined
          if (delta) {
            yield { content: delta, isDone: false, totalTokens, usage }
          }
          break
        }

        case 'response.reasoning_summary_text.delta': {
          const delta = json.delta as string | undefined
          if (delta) {
            yield { content: '', reasoning: delta, isDone: false, totalTokens, usage }
          }
          break
        }

        case 'response.output_item.added': {
          const item = json.item as Record<string, unknown> | undefined
          if (item?.type === 'function_call') {
            const callId = String(item.call_id ?? '')
            const itemId = String(item.id ?? '')
            const name = String(item.name ?? '')
            if (callId && itemId) {
              itemIdToCallId.set(itemId, callId)
              toolAccResp.set(callId, { id: callId, name, args: '' })
            }
          }
          break
        }

        case 'response.function_call_arguments.delta': {
          const itemId = String(json.item_id ?? '')
          const delta = String(json.delta ?? '')
          if (itemId && delta) {
            const callId = itemIdToCallId.get(itemId)
            if (callId) {
              const entry = toolAccResp.get(callId)
              if (entry) entry.args += delta
            }
          }
          break
        }

        case 'response.function_call_arguments.done': {
          const itemId = String(json.item_id ?? '')
          const args = String(json.arguments ?? '')
          if (itemId && args) {
            const callId = itemIdToCallId.get(itemId)
            if (callId) {
              const entry = toolAccResp.get(callId)
              if (entry) entry.args = args
            }
          }
          break
        }

        case 'response.completed': {
          const u = (json.response as Record<string, unknown>)?.usage as Record<string, unknown> | undefined
          if (u) {
            const inTok = (u.input_tokens as number) ?? 0
            const outTok = (u.output_tokens as number) ?? 0
            usage = mergeUsage(usage, {
              promptTokens: inTok,
              completionTokens: outTok,
              totalTokens: inTok + outTok
            })
            totalTokens = usage.totalTokens
          }

          const citations = extractWebSearchCitations(json)
          if (citations.length > 0) {
            yield { content: '', isDone: false, totalTokens, usage, toolResults: citations }
          }

          if (onToolCall && toolAccResp.size > 0) {
            yield* executeToolsAndContinue({
              config,
              modelId,
              messages,
              url,
              headers,
              toolAccResp,
              itemIdToCallId,
              usage,
              toolList,
              systemInstructions,
              thinkingBudget,
              temperature,
              topP,
              maxTokens,
              tools,
              onToolCall,
              extraHeaders,
              extraBody,
              maxToolLoopIterations,
              signal
            })
            return
          }

          yield { content: '', isDone: true, totalTokens, usage }
          return
        }
      }
    } catch {
      // JSON 解析错误，跳过
    }
  }

  yield { content: '', isDone: true, totalTokens, usage }
}

// ========== Tool Execution ==========

interface ExecuteToolsParams {
  config: ProviderConfigV2
  modelId: string
  messages: ChatMessage[]
  url: string
  headers: Record<string, string>
  toolAccResp: Map<string, { id: string; name: string; args: string }>
  itemIdToCallId: Map<string, string>
  usage?: TokenUsage
  toolList: Array<Record<string, unknown>>
  systemInstructions: string
  thinkingBudget?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  onToolCall: OnToolCallFn
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxToolLoopIterations: number
  signal?: AbortSignal
}

async function* executeToolsAndContinue(params: ExecuteToolsParams): AsyncGenerator<ChatStreamChunk> {
  const {
    config,
    modelId,
    messages,
    url,
    headers,
    toolAccResp,
    itemIdToCallId,
    usage: initialUsage,
    toolList,
    systemInstructions,
    thinkingBudget,
    temperature,
    topP,
    maxTokens,
    onToolCall,
    extraHeaders,
    extraBody,
    maxToolLoopIterations,
    signal
  } = params

  const upstreamModelId = helper.apiModelId(config, modelId)
  let usage = initialUsage
  let totalTokens = usage?.totalTokens ?? 0

  const callInfos: ToolCallInfo[] = []
  const msgs: Array<{ id: string; name: string; args: Record<string, unknown>; callId: string }> = []

  for (const [key, m] of toolAccResp) {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(m.args || '{}')
    } catch {
      args = {}
    }
    const id = m.id || key
    callInfos.push({ id, name: m.name, arguments: args })
    msgs.push({ id, name: m.name, args, callId: m.id || key })
  }

  if (callInfos.length > 0) {
    yield { content: '', isDone: false, totalTokens, usage, toolCalls: callInfos }
  }

  const resultsInfo: ToolResultInfo[] = []
  const toolOutputs: Array<Record<string, unknown>> = []

  for (const m of msgs) {
    const res = await onToolCall(m.name, m.args)
    resultsInfo.push({ id: m.id, name: m.name, arguments: m.args, content: res })
    toolOutputs.push({ type: 'function_call_output', call_id: m.callId, output: res })
  }

  if (resultsInfo.length > 0) {
    yield { content: '', isDone: false, totalTokens, usage, toolResults: resultsInfo }
  }

  const conversation: Array<Record<string, unknown>> = []
  for (const m of messages) {
    if (m.role === 'system') continue
    conversation.push({ role: m.role, content: m.content })
  }
  for (const m of msgs) {
    conversation.push({
      type: 'function_call',
      call_id: m.callId,
      name: m.name,
      arguments: JSON.stringify(m.args)
    })
  }
  conversation.push(...toolOutputs)

  for (let round = 0; round < maxToolLoopIterations; round++) {
    const body: Record<string, unknown> = {
      model: upstreamModelId,
      input: conversation,
      stream: true,
      ...(systemInstructions && { instructions: systemInstructions }),
      reasoning: { effort: 'high', summary: 'detailed' },
      ...(temperature !== undefined && { temperature }),
      ...(topP !== undefined && { top_p: topP }),
      ...(maxTokens !== undefined && maxTokens > 0 && { max_output_tokens: maxTokens }),
      ...(toolList.length > 0 && {
        tools: toolList,
        tool_choice: 'auto'
      })
    }

    const response = await postJsonStream({
      url,
      headers,
      body,
      signal
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorBody = await readErrorBody(response.rawStream)
      throw new Error(`HTTP ${response.statusCode}: ${errorBody}`)
    }

    toolAccResp.clear()
    itemIdToCallId.clear()

    for await (const line of response.lines) {
      const data = parseSSELine(line)
      if (data === null) continue

      try {
        const json = JSON.parse(data)
        const type = json.type as string

        switch (type) {
          case 'response.reasoning_summary_text.delta': {
            const delta = json.delta as string | undefined
            if (delta) yield { content: '', reasoning: delta, isDone: false, totalTokens, usage }
            break
          }
          case 'response.output_text.delta': {
            const delta = json.delta as string | undefined
            if (delta) yield { content: delta, isDone: false, totalTokens, usage }
            break
          }
          case 'response.output_item.added': {
            const item = json.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') {
              const callId = String(item.call_id ?? '')
              const itemId = String(item.id ?? '')
              const name = String(item.name ?? '')
              if (callId && itemId) {
                itemIdToCallId.set(itemId, callId)
                toolAccResp.set(callId, { id: callId, name, args: '' })
              }
            }
            break
          }
          case 'response.function_call_arguments.delta': {
            const itemId = String(json.item_id ?? '')
            const delta = String(json.delta ?? '')
            if (itemId && delta) {
              const callId = itemIdToCallId.get(itemId)
              if (callId) {
                const entry = toolAccResp.get(callId)
                if (entry) entry.args += delta
              }
            }
            break
          }
          case 'response.function_call_arguments.done': {
            const itemId = String(json.item_id ?? '')
            const args = String(json.arguments ?? '')
            if (itemId && args) {
              const callId = itemIdToCallId.get(itemId)
              if (callId) {
                const entry = toolAccResp.get(callId)
                if (entry) entry.args = args
              }
            }
            break
          }
          case 'response.completed': {
            const u = (json.response as Record<string, unknown>)?.usage as Record<string, unknown> | undefined
            if (u) {
              const inTok = (u.input_tokens as number) ?? 0
              const outTok = (u.output_tokens as number) ?? 0
              usage = mergeUsage(usage, {
                promptTokens: inTok,
                completionTokens: outTok,
                totalTokens: inTok + outTok
              })
              totalTokens = usage.totalTokens
            }
            break
          }
        }
      } catch {
        // ignore
      }
    }

    if (toolAccResp.size > 0) {
      const callInfos2: ToolCallInfo[] = []
      const msgs2: Array<{ id: string; name: string; args: Record<string, unknown>; callId: string }> = []

      for (const [key, m] of toolAccResp) {
        let args: Record<string, unknown>
        try { args = JSON.parse(m.args || '{}') } catch { args = {} }
        const id = m.id || key
        callInfos2.push({ id, name: m.name, arguments: args })
        msgs2.push({ id, name: m.name, args, callId: m.id || key })
      }

      if (callInfos2.length > 0) {
        yield { content: '', isDone: false, totalTokens, usage, toolCalls: callInfos2 }
      }

      const resultsInfo2: ToolResultInfo[] = []
      const toolOutputs2: Array<Record<string, unknown>> = []
      for (const m of msgs2) {
        const res = await onToolCall(m.name, m.args)
        resultsInfo2.push({ id: m.id, name: m.name, arguments: m.args, content: res })
        toolOutputs2.push({ type: 'function_call_output', call_id: m.callId, output: res })
      }

      if (resultsInfo2.length > 0) {
        yield { content: '', isDone: false, totalTokens, usage, toolResults: resultsInfo2 }
      }

      for (const m of msgs2) {
        conversation.push({ type: 'function_call', call_id: m.callId, name: m.name, arguments: JSON.stringify(m.args) })
      }
      conversation.push(...toolOutputs2)
      continue
    } else {
      break
    }
  }

  yield { content: '', isDone: true, totalTokens, usage }
}

// ========== Helpers ==========

function buildInputMessages(
  messages: ChatMessage[],
  userImages?: UserImage[]
): { input: Array<Record<string, unknown>>; instructions: string } {
  const input: Array<Record<string, unknown>> = []
  let instructions = ''

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const isLast = i === messages.length - 1
    const raw = typeof m.content === 'string' ? m.content : ''
    const role = m.role

    if (role === 'system') {
      if (raw) {
        instructions = instructions ? `${instructions}\n\n${raw}` : raw
      }
      continue
    }

    const hasMarkdownImages = raw.includes('![') && raw.includes('](')
    const hasCustomImages = raw.includes('[image:')
    const hasAttachedImages = isLast && userImages && userImages.length > 0 && role === 'user'

    if (hasMarkdownImages || hasCustomImages || hasAttachedImages) {
      const parts: Array<Record<string, unknown>> = []
      if (raw) {
        parts.push({ type: 'input_text', text: raw })
      }
      if (hasAttachedImages) {
        for (const img of userImages!) {
          const dataUrl = `data:${img.mime};base64,${img.base64}`
          parts.push({ type: 'input_image', image_url: dataUrl })
        }
      }
      input.push({ role, content: parts })
    } else {
      input.push({ role, content: raw })
    }
  }

  return { input, instructions }
}

function buildToolList(
  tools: ToolDefinition[] | undefined,
  config: ProviderConfigV2,
  modelId: string
): Array<Record<string, unknown>> {
  const toolList: Array<Record<string, unknown>> = []

  if (tools && tools.length > 0) {
    for (const t of tools) {
      const fn = t.function
      if (!fn?.name) continue
      toolList.push({
        type: 'function',
        name: fn.name,
        ...(fn.description && { description: fn.description }),
        ...(fn.parameters && { parameters: fn.parameters })
      })
    }
  }

  if (isResponsesWebSearchSupported(modelId)) {
    const builtIns = helper.builtInTools(config, modelId)
    if (builtIns.has('search')) {
      const ov = helper.modelOverride(config, modelId)
      const ws = (ov['webSearch'] as Record<string, unknown>) ?? {}

      const usePreview = ws['preview'] === true || String(ws['tool'] ?? '') === 'preview'
      const entry: Record<string, unknown> = {
        type: usePreview ? 'web_search_preview' : 'web_search'
      }

      if (Array.isArray(ws['allowed_domains']) && ws['allowed_domains'].length > 0) {
        entry['filters'] = { allowed_domains: ws['allowed_domains'].map(String) }
      }
      if (ws['user_location'] && typeof ws['user_location'] === 'object') {
        entry['user_location'] = ws['user_location']
      }
      if (usePreview && typeof ws['search_context_size'] === 'string') {
        entry['search_context_size'] = ws['search_context_size']
      }

      toolList.push(entry)
    }
  }

  return toolList
}

function extractWebSearchCitations(json: Record<string, unknown>): ToolResultInfo[] {
  try {
    const response = json.response as Record<string, unknown> | undefined
    const output = response?.output as Array<Record<string, unknown>> | undefined
    if (!output) return []

    const items: Array<Record<string, unknown>> = []
    const seen = new Set<string>()
    let idx = 1

    for (const it of output) {
      if (it.type !== 'message') continue
      const content = it.content as Array<Record<string, unknown>> | undefined
      if (!content) continue

      for (const block of content) {
        const anns = block.annotations as Array<Record<string, unknown>> | undefined
        if (!anns) continue

        for (const an of anns) {
          if (an.type !== 'url_citation') continue
          const citUrl = String(an.url ?? '')
          if (!citUrl || seen.has(citUrl)) continue

          const title = String(an.title ?? '')
          items.push({ index: idx, url: citUrl, ...(title && { title }) })
          seen.add(citUrl)
          idx++
        }
      }
    }

    if (items.length === 0) return []
    return [{
      id: 'builtin_search',
      name: 'search_web',
      arguments: {},
      content: JSON.stringify({ items })
    }]
  } catch {
    return []
  }
}

function isResponsesWebSearchSupported(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (m.startsWith('gpt-4o')) return true
  if (m === 'gpt-4.1' || m === 'gpt-4.1-mini') return true
  if (m.startsWith('o4-mini')) return true
  if (m === 'o3' || m.startsWith('o3-')) return true
  if (m.startsWith('gpt-5')) return true
  return false
}

function checkModelIsReasoning(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (/^o[134]/.test(m)) return true
  if (m.startsWith('o3') || m.startsWith('o4')) return true
  return false
}
